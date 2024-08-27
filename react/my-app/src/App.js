import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Home from './components/Home';
import Login from './components/Login';
//import Register from './components/Register';
import Chat from './components/Chat';
import RagChat from './components/RagChat';
import { EnvProvider } from './EnvProvider';


import { useState, useEffect } from 'react';

const PrivateRoute = ({ children }) => {
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

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <EnvProvider>
    <Router>
      <div className={`app`}>
        <nav>
          <ul>
            <li>
              <Link to="/chat">Chat</Link>
            </li>
            <li>
              <Link to="/ragchat">RagChat</Link>
            </li>
          </ul>
        </nav>

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<PrivateRoute><Home /></PrivateRoute>} />
        <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
                <Route path="/ragchat" element={<PrivateRoute><RagChat /></PrivateRoute>} />
      </Routes>
      </div>
    </Router>
    </EnvProvider>
  );
}

export default App;
