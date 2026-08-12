const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILMS_PATH = path.join(DATA_DIR, 'films.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(filePath, defaultValue) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJSON(filePath, data) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Films
function loadFilmsDB() {
  const data = loadJSON(FILMS_PATH, { films: [] });
  if (data.films.length === 0) {
    data.films = [
      { id: 't1', title: "The Last Horizon", category: "trending", genre: "Adventure", year: 2026, rating: 8.9, poster_path: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400&q=80", video_path: "", description: "A journey beyond the edge of the known world.", is_new: true, created_at: new Date().toISOString() },
      { id: 't2', title: "Neon Nights", category: "trending", genre: "Cyberpunk", year: 2026, rating: 8.5, poster_path: "https://images.unsplash.com/photo-1515634928627-2a4e0dae3ddf?w=400&q=80", video_path: "", description: "In a city of light, darkness finds a way.", is_new: false, created_at: new Date().toISOString() },
      { id: 't3', title: "Silent Waves", category: "trending", genre: "Drama", year: 2025, rating: 8.7, poster_path: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&q=80", video_path: "", description: "Love and loss on the Irish coast.", is_new: false, created_at: new Date().toISOString() },
      { id: 't4', title: "Quantum Drift", category: "trending", genre: "Sci-Fi", year: 2026, rating: 9.1, poster_path: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&q=80", video_path: "", description: "Time is not a line. It's a maze.", is_new: true, created_at: new Date().toISOString() },
      { id: 't5', title: "Crimson Dawn", category: "trending", genre: "Action", year: 2025, rating: 8.3, poster_path: "https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=400&q=80", video_path: "", description: "One man against an empire at sunrise.", is_new: false, created_at: new Date().toISOString() },
      { id: 'n1', title: "Velvet Shadows", category: "new", genre: "Mystery", year: 2026, rating: 7.9, poster_path: "https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=400&q=80", video_path: "", description: "Every shadow hides a secret.", is_new: true, created_at: new Date().toISOString() },
      { id: 'n2', title: "Solaris Rising", category: "new", genre: "Sci-Fi", year: 2026, rating: 8.4, poster_path: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=400&q=80", video_path: "", description: "The sun brings more than light.", is_new: true, created_at: new Date().toISOString() },
      { id: 'n3', title: "Paper Hearts", category: "new", genre: "Romance", year: 2026, rating: 8.0, poster_path: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=400&q=80", video_path: "", description: "A love story written in letters.", is_new: true, created_at: new Date().toISOString() },
      { id: 'n4', title: "Iron Gate", category: "new", genre: "War", year: 2026, rating: 7.6, poster_path: "https://images.unsplash.com/photo-1533613220915-609f661a6fe1?w=400&q=80", video_path: "", description: "The gate stands. So do they.", is_new: true, created_at: new Date().toISOString() },
      { id: 'n5', title: "Glass Garden", category: "new", genre: "Fantasy", year: 2026, rating: 8.2, poster_path: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80", video_path: "", description: "Beauty that cuts like glass.", is_new: true, created_at: new Date().toISOString() },
      { id: 'p1', title: "Eternal Return", category: "top", genre: "Drama", year: 2024, rating: 9.6, poster_path: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&q=80", video_path: "", description: "What if you could live forever?", is_new: false, created_at: new Date().toISOString() },
      { id: 'p2', title: "The Fallen King", category: "top", genre: "Epic", year: 2023, rating: 9.4, poster_path: "https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=400&q=80", video_path: "", description: "A crown too heavy to wear.", is_new: false, created_at: new Date().toISOString() },
      { id: 'p3', title: "Blue Meridian", category: "top", genre: "Documentary", year: 2025, rating: 9.3, poster_path: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=400&q=80", video_path: "", description: "The ocean's untold story.", is_new: false, created_at: new Date().toISOString() },
      { id: 'p4', title: "White Noise", category: "top", genre: "Horror", year: 2024, rating: 9.0, poster_path: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=400&q=80", video_path: "", description: "Listen closely. It's already here.", is_new: false, created_at: new Date().toISOString() },
      { id: 'p5', title: "Golden Age", category: "top", genre: "History", year: 2023, rating: 8.9, poster_path: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&q=80", video_path: "", description: "The age that never was.", is_new: false, created_at: new Date().toISOString() }
    ];
    saveJSON(FILMS_PATH, data);
    console.log('Database seeded with 15 demo films.');
  }
  return data;
}

function saveFilmsDB(data) {
  saveJSON(FILMS_PATH, data);
}

// Users
function loadUsersDB() {
  return loadJSON(USERS_PATH, { users: [] });
}

function saveUsersDB(data) {
  saveJSON(USERS_PATH, data);
}

module.exports = { loadFilmsDB, saveFilmsDB, loadUsersDB, saveUsersDB };
