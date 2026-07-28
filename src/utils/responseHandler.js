function sendSuccess(res, message = 'Success', data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

function sendError(res, message = 'An error occurred', statusCode = 500, errors = null) {
  const response = {
    success: false,
    message
  };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
}

module.exports = {
  sendSuccess,
  sendError
};
