import axios from 'axios';

// Base URL for API requests
const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
console.log('API Base URL:', baseURL);

// Error message mapping
const getErrorMessage = (error) => {
  // Network error - no response from server
  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      return {
        title: 'Request Timeout',
        message: 'The server took too long to respond. Please check your connection.',
        code: 'TIMEOUT',
      };
    }
    if (error.message?.includes('ERR_NETWORK')) {
      return {
        title: 'Network Error',
        message: `Cannot connect to server at ${baseURL}. Make sure the backend is running.`,
        code: 'NETWORK_ERROR',
        baseURL,
      };
    }
    return {
      title: 'Connection Failed',
      message: error.message || 'Unable to reach the server. Please check your internet connection.',
      code: 'CONNECTION_FAILED',
    };
  }

  const { status, data } = error.response;

  // Server-provided error message
  if (data?.error) {
    return {
      title: 'Login Failed',
      message: data.error,
      code: `HTTP_${status}`,
      status,
    };
  }

  // HTTP status code specific messages
  const statusMessages = {
    400: {
      title: 'Invalid Request',
      message: 'Please check your email and password format.',
      code: 'INVALID_INPUT',
    },
    401: {
      title: 'Authentication Failed',
      message: 'Email or password is incorrect. Please try again.',
      code: 'INVALID_CREDENTIALS',
    },
    403: {
      title: 'Access Denied',
      message: 'Your account does not have permission to access this resource.',
      code: 'FORBIDDEN',
    },
    404: {
      title: 'Backend Not Found',
      message: `The backend API could not be found at ${baseURL}. Ensure the server is running on port 5000.`,
      code: 'BACKEND_NOT_FOUND',
      baseURL,
    },
    500: {
      title: 'Server Error',
      message: 'The server encountered an error. Please try again later.',
      code: 'SERVER_ERROR',
    },
    502: {
      title: 'Bad Gateway',
      message: 'The server is temporarily unavailable. Please wait a moment and try again.',
      code: 'BAD_GATEWAY',
    },
    503: {
      title: 'Service Unavailable',
      message: 'The server is currently down for maintenance. Please try again later.',
      code: 'SERVICE_UNAVAILABLE',
    },
  };

  return statusMessages[status] || {
    title: 'Request Failed',
    message: `Server responded with error ${status}: ${data?.message || 'Unknown error'}`,
    code: `HTTP_${status}`,
    status,
  };
};

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000, // 10 second timeout
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('tf_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    // Attach detailed error info to the error object
    err.errorInfo = getErrorMessage(err);

    if (err.response?.status === 401) {
      // Don't redirect on login attempts - let the login page handle auth errors
      const isLoginRequest = err.config?.url?.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('tf_token');
        localStorage.removeItem('tf_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
