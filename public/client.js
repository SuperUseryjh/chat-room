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

const chatContainer = document.getElementById('chat-container');
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const adminPanelButton = document.getElementById('admin-panel-button');

const adminPanel = document.getElementById('admin-panel');
const adminPanelClose = document.getElementById('admin-panel-close');
const adminUserList = document.getElementById('admin-user-list');
const addInviteCodeForm = document.getElementById('add-invite-code-form');
const newInviteCodeInput = document.getElementById('new-invite-code');
const newInviteMaxUsesInput = document.getElementById('new-invite-max-uses');
const inviteCodeMessage = document.getElementById('invite-code-message');

let currentUsername = '';
let isAdmin = false;

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
            authContainer.style.display = 'none';
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
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        socket.emit('chat message', input.value);
        input.value = '';
    }
});

// 接收历史消息
socket.on('history messages', (msgs) => {
    msgs.forEach(data => {
        const item = document.createElement('li');
        item.textContent = `${data.username}: ${data.message}`;
        messages.appendChild(item);
    });
    messages.scrollTop = messages.scrollHeight;
});

// 接收聊天消息
socket.on('chat message', (data) => {
    const item = document.createElement('li');
    item.textContent = `${data.username}: ${data.message}`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight; // 滚动到底部
});

// 用户加入通知
socket.on('user joined', (username) => {
    const item = document.createElement('li');
    item.textContent = `${username} 加入了聊天室`;
    item.style.fontStyle = 'italic';
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

// 用户离开通知
socket.on('user left', (username) => {
    const item = document.createElement('li');
    item.textContent = `${username} 离开了聊天室`;
    item.style.fontStyle = 'italic';
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

// 接收聊天错误信息 (例如被禁言)
socket.on('chat error', (errorMessage) => {
    alert(errorMessage);
});

// 管理员面板逻辑
adminPanelButton.addEventListener('click', () => {
    adminPanel.style.display = 'flex';
    loadAdminPanelData();
});

adminPanelClose.addEventListener('click', () => {
    adminPanel.style.display = 'none';
});

async function loadAdminPanelData() {
    try {
        const response = await fetch('/admin/users', {
            headers: {
                'X-Username': currentUsername,
                'X-IsAdmin': isAdmin.toString(),
            },
        });
        const data = await response.json();

        if (data.success) {
            renderUserList(data.users);
        } else {
            alert('获取用户列表失败: ' + data.message);
        }
    } catch (error) {
        console.error('获取用户列表请求失败:', error);
        alert('获取用户列表失败');
    }
}

function renderUserList(users) {
    adminUserList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-list-item';
        li.innerHTML = `
            <span>${user.username} ${user.isAdmin ? '(管理员)' : ''}</span>
            <div class="user-actions">
                <button class="mute-button" data-username="${user.username}" data-muted="${user.isMuted || false}">${user.isMuted ? '解禁' : '禁言'}</button>
                <button class="admin-button" data-username="${user.username}" data-isadmin="${user.isAdmin}">${user.isAdmin ? '取消管理员' : '设为管理员'}</button>
            </div>
        `;
        adminUserList.appendChild(li);
    });

    // 添加事件监听器
    adminUserList.querySelectorAll('.mute-button').forEach(button => {
        button.addEventListener('click', handleMuteToggle);
    });
    adminUserList.querySelectorAll('.admin-button').forEach(button => {
        button.addEventListener('click', handleAdminToggle);
    });
}

async function handleMuteToggle(event) {
    const button = event.target;
    const username = button.dataset.username;
    const isMuted = button.dataset.muted === 'true';
    const newMuteStatus = !isMuted;

    try {
        const response = await fetch('/admin/mute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Username': currentUsername,
                'X-IsAdmin': isAdmin.toString(),
            },
            body: JSON.stringify({ username, mute: newMuteStatus }),
        });
        const data = await response.json();

        if (data.success) {
            alert(data.message);
            loadAdminPanelData(); // 重新加载用户列表
        } else {
            alert('操作失败: ' + data.message);
        }
    } catch (error) {
        console.error('禁言/解禁请求失败:', error);
        alert('操作失败');
    }
}

async function handleAdminToggle(event) {
    const button = event.target;
    const username = button.dataset.username;
    const currentAdminStatus = button.dataset.isadmin === 'true';
    const newAdminStatus = !currentAdminStatus;

    try {
        const response = await fetch('/admin/set-admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Username': currentUsername,
                'X-IsAdmin': isAdmin.toString(),
            },
            body: JSON.stringify({ username, isAdmin: newAdminStatus }),
        });
        const data = await response.json();

        if (data.success) {
            alert(data.message);
            loadAdminPanelData(); // 重新加载用户列表
        } else {
            alert('操作失败: ' + data.message);
        }
    } catch (error) {
        console.error('设置/取消管理员请求失败:', error);
        alert('操作失败');
    }
}

// 添加邀请码逻辑
addInviteCodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = newInviteCodeInput.value.trim();
    const maxUses = parseInt(newInviteMaxUsesInput.value, 10);

    if (!code || isNaN(maxUses) || maxUses <= 0) {
        inviteCodeMessage.textContent = '邀请码和有效使用次数不能为空且必须大于0';
        inviteCodeMessage.style.color = 'red';
        inviteCodeMessage.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/admin/invitation-codes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Username': currentUsername,
                'X-IsAdmin': isAdmin.toString(),
            },
            body: JSON.stringify({ code, maxUses }),
        });
        const data = await response.json();

        if (data.success) {
            inviteCodeMessage.textContent = data.message;
            inviteCodeMessage.style.color = 'green';
            inviteCodeMessage.style.display = 'block';
            newInviteCodeInput.value = '';
            newInviteMaxUsesInput.value = '1';
        } else {
            inviteCodeMessage.textContent = data.message;
            inviteCodeMessage.style.color = 'red';
            inviteCodeMessage.style.display = 'block';
        }
    } catch (error) {
        console.error('添加邀请码请求失败:', error);
        inviteCodeMessage.textContent = '添加邀请码失败';
        inviteCodeMessage.style.color = 'red';
        inviteCodeMessage.style.display = 'block';
    }
});
