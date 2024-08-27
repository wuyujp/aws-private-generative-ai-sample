// components/Register.js

import { useState, useEffect } from 'react';
import styles from '../index.module.css';
import { useNavigate } from 'react-router-dom';

const Register = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const navigate = useNavigate();
    useEffect(() => {
        // マウント時の処理などを記述
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const formData = {
                email,
                password,
                nickname // nicknameをフォームデータに含める
            };

            const requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            };

            const apiUrl = 'https://jsonplaceholder.typicode.com/users';

            const response = await fetch(apiUrl, requestOptions);
            if (!response.ok) {
                throw new Error('Registration failed');
            }

            const data = await response.json();
            console.log('Registration successful!', data);
            // ここでトークンを保存するなどの処理を行う
            localStorage.setItem('nickname', JSON.stringify(nickname)); 
            // nicknameを文字列としてローカルストレージに保存
        } catch (error) {
            console.error('Registration failed:', error);
            // エラーメッセージを表示するなどの処理を行う
        }
    };

    const handleRegister = () => {
        // Registerボタンがクリックされたときの処理を記述
        fetchData();
        navigate('/login'); // 登録後にログインページにリダイレクト
    };

    return (
        <div className={styles['box']}>
            <h2>Register(新規登録)</h2>
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
                <input
                    type="text"
                    placeholder="Nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)} // nicknameの入力値を更新する
                />
                <button type="button" onClick={handleRegister}>
                    Register
                </button>
            </form>
        </div>
    );
}

export default Register;