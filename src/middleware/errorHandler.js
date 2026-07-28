const { sendError } = require('../utils/responseHandler');

function errorHandler(err, req, res, next) {
  console.error('Unhandled Error:', err);

  if (err.name === 'ValidationError') {
    return sendError(res, 'Validation error occurred', 400, err.errors);
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return sendError(res, 'Duplicate entry error: Record already exists.', 409);
  }

  return sendError(res, err.message || 'Internal Server Error', err.statusCode || 500);
}

module.exports = errorHandler;
