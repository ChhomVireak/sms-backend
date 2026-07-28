const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'edutrack_sms_super_secret_jwt_key_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'edutrack_sms_super_secret_refresh_key_2026';

function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
