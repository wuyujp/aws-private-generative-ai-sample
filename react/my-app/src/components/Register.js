// components/Register.js

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEnv } from '../EnvProvider';
import './Login.css';


const Register = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();
    const [error, setError] = useState(null);
    const env = useEnv();

    const fetchData = async () => {
        try {

            const requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            };

            const apiUrl = env.API_URL;

            const response = await fetch(`${apiUrl}register`, requestOptions);
            const data = await response.json();

            if (!response.ok) {
                console.log('Response Error', data);
                if (data.error) {
                    setError(data.error);
                    throw new Error(data.error);
                }
                else {
                    setError('An unknown error occurred');
                    throw new Error('An unknown error occurred');
                }
            }

            console.log('Registration successful!', data);
            navigate('/login'); // 登録後にログインページにリダイレクト
            // ここでトークンを保存するなどの処理を行う
        }
        catch (error) {
            console.error('Registration failed:', error);
        }
    };

    const handleRegister = () => {
        // Registerボタンがクリックされたときの処理を記述
        fetchData();
    };

    return (
        <div className="loginBox">
            <h2>Register</h2>
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
                <button type="button" onClick={handleRegister}>
                    Register
                </button>
                {error && <p>{error}</p>}
            </form>
        </div>
    );
}

export default Register;
