const socket = io();

const authContainer = document.getElementById('auth-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginButton = document.getElementById('login-button');
const showRegisterLink = document.getElementById('show-register');
const authError = document.getElementById('auth-error');

const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const invitationCodeInput = document.getElementById('invitation-code-input');
const registerButton = document.getElementById('register-button');
const showLoginLink = document.getElementById('show-login');
const registerError = document.getElementById('register-error');

const sidebar = document.getElementById('sidebar');
const chatContainer = document.getElementById('chat-container');
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const adminPanelButton = document.getElementById('admin-panel-button');
const imageInput = document.getElementById('image-input');

const changePasswordButton = document.getElementById('change-password-button');
const changePasswordModal = document.getElementById('change-password-modal');
const closePasswordModalButton = changePasswordModal.querySelector('.close-button');
const oldPasswordInput = document.getElementById('old-password-input');
const newPasswordInput = document.getElementById('new-password-input');
const confirmNewPasswordInput = document.getElementById('confirm-new-password-input');
const submitChangePasswordButton = document.getElementById('submit-change-password');
const changePasswordMessage = document.getElementById('change-password-message');

const logoutButton = document.getElementById('logout-button');

let currentUsername = '';
let isAdmin = false;
let authToken = null; // 存储 JWT

// 辅助函数：格式化时间戳
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// 辅助函数：添加消息到聊天窗口
function addMessageToChat(data, isSystem = false) {
    const item = document.createElement('li');
    if (isSystem) {
        item.className = 'system-message';
        item.textContent = data.message;
    } else {
        item.className = 'message-item';
        if (data.username === currentUsername) {
            item.classList.add('my-message');
        }
        item.innerHTML = `
            <div class="message-meta">${data.username} ${formatTimestamp(data.timestamp)}</div>
            <div class="message-content">${data.message || ''}
                ${data.file_url ? `<img src="${data.file_url}" alt="Image" />` : ''}
            </div>
        `;
    }
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', () => {
    authToken = localStorage.getItem('chat_token');
    currentUsername = localStorage.getItem('chat_username');
    isAdmin = localStorage.getItem('chat_isAdmin') === 'true';

    if (authToken && currentUsername) {
        // 尝试使用 JWT 重新连接 Socket.IO
        socket.emit('reconnect_login', authToken, (response) => {
            if (response.success) {
                authContainer.style.display = 'none';
                sidebar.style.display = 'flex'; // 显示侧边栏
                chatContainer.style.display = 'flex';
                if (isAdmin) {
                    adminPanelButton.style.display = 'block';
                }
            } else {
                // 如果重新登录失败，清除 localStorage 并显示登录界面
                localStorage.removeItem('chat_token');
                localStorage.removeItem('chat_username');
                localStorage.removeItem('chat_isAdmin');
                authContainer.style.display = 'flex';
                sidebar.style.display = 'none';
                chatContainer.style.display = 'none';
                alert('登录会话已过期或无效，请重新登录。');
            }
        });
    } else {
        authContainer.style.display = 'flex';
        sidebar.style.display = 'none';
        chatContainer.style.display = 'none';
    }
});

// 切换到注册表单
showRegisterLink.addEventListener('click', () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    authError.style.display = 'none';
    registerError.style.display = 'none';
});

// 切换到登录表单
showLoginLink.addEventListener('click', () => {
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    authError.style.display = 'none';
    registerError.style.display = 'none';
});

// 注册逻辑
registerButton.addEventListener('click', async () => {
    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value.trim();
    const invitationCode = invitationCodeInput.value.trim();

    if (!username || !password || !invitationCode) {
        registerError.textContent = '用户名、密码和邀请码不能为空';
        registerError.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password, invitationCode }),
        });
        const data = await response.json();

        if (data.success) {
            alert('注册成功，请登录！');
            showLoginLink.click(); // 注册成功后自动切换到登录界面
            registerUsernameInput.value = '';
            registerPasswordInput.value = '';
            invitationCodeInput.value = '';
        } else {
            registerError.textContent = data.message;
            registerError.style.display = 'block';
        }
    } catch (error) {
        console.error('注册请求失败:', error);
        registerError.textContent = '注册失败，请稍后再试';
        registerError.style.display = 'block';
    }
});

// 登录逻辑
loginButton.addEventListener('click', () => {
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!username || !password) {
        authError.textContent = '用户名和密码不能为空';
        authError.style.display = 'block';
        return;
    }

    socket.emit('login', { username, password }, (response) => {
        if (response.success) {
            currentUsername = response.username;
            isAdmin = response.isAdmin;
            authToken = response.token; // 存储 JWT

            // 将用户信息和 token 存储到 localStorage
            localStorage.setItem('chat_username', currentUsername);
            localStorage.setItem('chat_isAdmin', isAdmin.toString());
            localStorage.setItem('chat_token', authToken);

            authContainer.style.display = 'none';
            sidebar.style.display = 'flex'; // 显示侧边栏
            chatContainer.style.display = 'flex'; // 显示聊天界面

            if (isAdmin) {
                adminPanelButton.style.display = 'block';
            }
        } else {
            authError.textContent = response.message;
            authError.style.display = 'block';
        }
    });
});

// 聊天消息发送逻辑
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const messageText = input.value.trim();
    const imageFile = imageInput.files[0];

    if (!messageText && !imageFile) {
        return; // 没有消息也没有图片，不发送
    }

    if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();

            if (data.success) {
                socket.emit('chat message', { token: authToken, text: messageText, fileUrl: data.fileUrl }, (res) => {
                    if (!res.success) {
                        alert(res.message);
                        if (res.message.includes('token') || res.message.includes('登录会话')) {
                            // JWT 无效或过期，强制重新登录
                            localStorage.removeItem('chat_token');
                            localStorage.removeItem('chat_username');
                            localStorage.removeItem('chat_isAdmin');
                            window.location.reload();
                        }
                    }
                });
                input.value = '';
                imageInput.value = ''; // 清空文件选择
            } else {
                alert('图片上传失败: ' + data.message);
            }
        } catch (error) {
            console.error('图片上传请求失败:', error);
            alert('图片上传失败');
        }
    } else if (messageText) {
        socket.emit('chat message', { token: authToken, text: messageText }, (res) => {
            if (!res.success) {
                alert(res.message);
                if (res.message.includes('token') || res.message.includes('登录会话')) {
                    // JWT 无效或过期，强制重新登录
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.reload();
                }
            }
        });
        input.value = '';
    }
});

// 接收历史消息
socket.on('history messages', (msgs) => {
    msgs.forEach(data => {
        addMessageToChat(data);
    });
});

// 接收聊天消息
socket.on('chat message', (data) => {
    addMessageToChat(data);
});

// 用户加入通知
socket.on('user joined', (username) => {
    addMessageToChat({ message: `${username} 加入了聊天室`, timestamp: new Date().toISOString() }, true);
});

// 用户离开通知
socket.on('user left', (username) => {
    addMessageToChat({ message: `${username} 离开了聊天室`, timestamp: new Date().toISOString() }, true);
});

// 接收聊天错误信息 (例如被禁言)
socket.on('chat error', (errorMessage) => {
    alert(errorMessage);
});

// 修改密码功能
changePasswordButton.addEventListener('click', () => {
    changePasswordModal.style.display = 'flex';
    changePasswordMessage.style.display = 'none';
    oldPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmNewPasswordInput.value = '';
});

closePasswordModalButton.addEventListener('click', () => {
    changePasswordModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === changePasswordModal) {
        changePasswordModal.style.display = 'none';
    }
});

submitChangePasswordButton.addEventListener('click', async () => {
    const oldPassword = oldPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmNewPassword = confirmNewPasswordInput.value;

    if (!oldPassword || !newPassword || !confirmNewPassword) {
        changePasswordMessage.textContent = '所有密码字段都不能为空';
        changePasswordMessage.style.display = 'block';
        return;
    }

    if (newPassword !== confirmNewPassword) {
        changePasswordMessage.textContent = '新密码和确认密码不匹配';
        changePasswordMessage.style.display = 'block';
        return;
    }

    if (newPassword.length < 6) {
        changePasswordMessage.textContent = '新密码长度不能少于6位';
        changePasswordMessage.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({ oldPassword, newPassword }),
        });
        const data = await response.json();

        if (data.success) {
            alert(data.message);
            // 密码修改成功后，强制用户重新登录以获取新的 JWT
            localStorage.removeItem('chat_token');
            localStorage.removeItem('chat_username');
            localStorage.removeItem('chat_isAdmin');
            window.location.reload();
        } else {
            changePasswordMessage.textContent = data.message;
            changePasswordMessage.style.display = 'block';
            if (data.message.includes('token') || data.message.includes('授权')) {
                // JWT 无效或过期，强制重新登录
                localStorage.removeItem('chat_token');
                localStorage.removeItem('chat_username');
                localStorage.removeItem('chat_isAdmin');
                window.location.reload();
            }
        }
    } catch (error) {
        console.error('修改密码请求失败:', error);
        changePasswordMessage.textContent = '修改密码失败，请稍后再试';
        changePasswordMessage.style.display = 'block';
    }
});

// 退出登录功能
logoutButton.addEventListener('click', () => {
    localStorage.removeItem('chat_token');
    localStorage.removeItem('chat_username');
    localStorage.removeItem('chat_isAdmin');
    window.location.reload(); // 刷新页面回到登录界面
});
