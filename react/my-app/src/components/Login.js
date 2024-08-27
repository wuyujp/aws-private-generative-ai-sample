// components/Login.js 

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import { useEnv } from '../EnvProvider';

const Login = ({ setIsAuthenticated }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();
    const [error, setError] = useState(null);
    const env = useEnv();

    const handleLogin = async () => {
        try {
            const response = await fetch(`${env.API_URL}login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                throw new Error('ユーザー名またはパスワードが正しくありません');
            }

            const data = await response.json();
            localStorage.setItem('jwt', data.token);
            localStorage.setItem('user', email);
            setIsAuthenticated(true);
            navigate('/home');
        }
        catch (error) {
            console.error('Error:', error);
            setError(error.message || '認証に失敗しました');
        }
    };

    // const handleLogin = async () => {
    //     navigate('/');
    //     localStorage.setItem('jwt', 'dummy');
    // }

    return (
        <div className="loginBox">
            <h2>Login</h2>
            <form>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={handleLogin}>
                    Login
                </button>
                {error && <p>{error}</p>}
            </form>
        </div>
    );
}

export default Login;
