const express = require('express');
const router = express.Router();
const Film = require('../models/Film');
const VideoSession = require('../models/VideoSession');
const WatchProgress = require('../models/WatchProgress');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Watchlist = require('../models/Watchlist');
const { authMiddleware, filmmakerMiddleware } = require('../middleware/auth');

// GET /api/analytics/overview - filmmaker dashboard overview
router.get('/overview', authMiddleware, filmmakerMiddleware, async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user.id });
    const filmIds = films.map(f => f._id.toString());

    const totalViews = films.reduce((sum, f) => sum + (f.views || 0), 0);
    const totalFilms = films.length;
    const published = films.filter(f => f.status === 'published' || f.status === 'approved').length;
    const pending = films.filter(f => f.status === 'pending_review').length;

    // Get total watch time from sessions
    const sessions = await VideoSession.find({ film: { $in: filmIds } });
    const totalWatchTime = sessions.reduce((sum, s) => sum + (s.watchDuration || 0), 0);

    // Get total likes across all films
    const likes = await Like.countDocuments({ film: { $in: filmIds } });

    // Get total comments
    const comments = await Comment.countDocuments({ film: { $in: filmIds } });

    // Get total watchlist adds
    const watchlistAdds = await Watchlist.countDocuments({ film: { $in: filmIds } });

    // Get followers count
    const FilmmakerProfile = require('../models/FilmmakerProfile');
    const profile = await FilmmakerProfile.findOne({ user: req.user.id });
    const followers = profile?.followers?.length || 0;

    res.json({
      success: true,
      overview: {
        totalFilms,
        published,
        pending,
        totalViews,
        totalWatchTime: Math.round(totalWatchTime / 60), // minutes
        totalLikes: likes,
        totalComments: comments,
        watchlistAdds,
        followers,
        estimatedEarnings: Math.round(totalWatchTime / 60 * 0.01 * 100) / 100 // $0.01 per minute watched
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/films - analytics per film
router.get('/films', authMiddleware, filmmakerMiddleware, async (req, res) => {
  try {
    const films = await Film.find({ filmmaker: req.user.id }).sort({ createdAt: -1 });
    const filmIds = films.map(f => f._id.toString());

    const analytics = await Promise.all(films.map(async (film) => {
      const sessions = await VideoSession.find({ film: film._id });
      const progress = await WatchProgress.find({ film: film._id });
      const likes = await Like.countDocuments({ film: film._id });
      const comments = await Comment.countDocuments({ film: film._id });
      const watchlist = await Watchlist.countDocuments({ film: film._id });

      const totalWatchTime = sessions.reduce((sum, s) => sum + (s.watchDuration || 0), 0);
      const avgWatchTime = sessions.length > 0 ? Math.round(totalWatchTime / sessions.length) : 0;
      const completionRate = progress.length > 0 
        ? Math.round((progress.filter(p => p.completed).length / progress.length) * 100) 
        : 0;
      const avgPercentWatched = progress.length > 0
        ? Math.round(progress.reduce((sum, p) => sum + (p.percentWatched || 0), 0) / progress.length)
        : 0;

      return {
        film: {
          _id: film._id,
          title: film.title,
          img: film.img,
          status: film.status,
          views: film.views,
          createdAt: film.createdAt
        },
        analytics: {
          views: film.views || 0,
          uniqueViewers: sessions.length,
          totalWatchTime: Math.round(totalWatchTime / 60),
          avgWatchTime: Math.round(avgWatchTime / 60),
          completionRate,
          avgPercentWatched,
          likes,
          comments,
          watchlistAdds: watchlist,
          estimatedEarnings: Math.round(totalWatchTime / 60 * 0.01 * 100) / 100
        }
      };
    }));

    res.json({ success: true, analytics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/film/:id - detailed analytics for one film
router.get('/film/:id', authMiddleware, filmmakerMiddleware, async (req, res) => {
  try {
    const film = await Film.findOne({ _id: req.params.id, filmmaker: req.user.id });
    if (!film) return res.status(404).json({ success: false, error: 'Film not found' });

    const sessions = await VideoSession.find({ film: req.params.id });
    const progress = await WatchProgress.find({ film: req.params.id });
    const likes = await Like.countDocuments({ film: req.params.id });
    const comments = await Comment.countDocuments({ film: req.params.id });
    const watchlist = await Watchlist.countDocuments({ film: req.params.id });

    // Daily views (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dailyViews = await VideoSession.aggregate([
      { $match: { film: film._id, startedAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Watch time distribution
    const watchTimeDistribution = [
      { range: '0-25%', count: progress.filter(p => p.percentWatched <= 25).length },
      { range: '26-50%', count: progress.filter(p => p.percentWatched > 25 && p.percentWatched <= 50).length },
      { range: '51-75%', count: progress.filter(p => p.percentWatched > 50 && p.percentWatched <= 75).length },
      { range: '76-100%', count: progress.filter(p => p.percentWatched > 75).length }
    ];

    const totalWatchTime = sessions.reduce((sum, s) => sum + (s.watchDuration || 0), 0);

    res.json({
      success: true,
      film: {
        _id: film._id,
        title: film.title,
        img: film.img,
        views: film.views,
        status: film.status
      },
      analytics: {
        views: film.views || 0,
        uniqueViewers: sessions.length,
        totalWatchTime: Math.round(totalWatchTime / 60),
        avgWatchTime: sessions.length > 0 ? Math.round((totalWatchTime / sessions.length) / 60) : 0,
        completionRate: progress.length > 0 ? Math.round((progress.filter(p => p.completed).length / progress.length) * 100) : 0,
        avgPercentWatched: progress.length > 0 ? Math.round(progress.reduce((sum, p) => sum + (p.percentWatched || 0), 0) / progress.length) : 0,
        likes,
        comments,
        watchlistAdds: watchlist,
        estimatedEarnings: Math.round(totalWatchTime / 60 * 0.01 * 100) / 100,
        dailyViews,
        watchTimeDistribution
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
