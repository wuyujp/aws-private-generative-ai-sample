import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Home from './components/Home';
import Login from './components/Login';
import Register from './components/Register';
import Chat from './components/Chat';
import RagChat from './components/RagChat';
import { EnvProvider } from './EnvProvider';

import { useState, useEffect } from 'react';

const PrivateRoute = ({ children, isAuthenticated }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('jwt');
      setIsAuthenticated(!!token);
      setLoading(false);
    };
    checkAuth();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <EnvProvider>
      <Router>
        <div className={`app`}>
          <nav>
            <ul>
              {isAuthenticated ? (
                <>
                  <li>
                    <Link to="/chat">Chat</Link>
                  </li>
                  <li>
                    <Link to="/ragchat">RagChat</Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link to="/login">Login</Link>
                  </li>             
                  <li>
                    <Link to="/register">Register</Link>
                  </li>
                </>
              )}
            </ul>
          </nav>

          <Routes>
             <Route path="/login" element={<Login setIsAuthenticated={setIsAuthenticated} />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route
              path="/home"
              element={<PrivateRoute isAuthenticated={isAuthenticated}><Home /></PrivateRoute>}
            />
            <Route
              path="/chat"
              element={<PrivateRoute isAuthenticated={isAuthenticated}><Chat /></PrivateRoute>}
            />
            <Route
              path="/ragchat"
              element={<PrivateRoute isAuthenticated={isAuthenticated}><RagChat /></PrivateRoute>}
            />
          </Routes>
        </div>
      </Router>
    </EnvProvider>
  );
}

export default App;
