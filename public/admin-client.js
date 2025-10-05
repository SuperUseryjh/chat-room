document.addEventListener('DOMContentLoaded', () => {
    const adminUserList = document.getElementById('admin-user-list');
    const addInviteCodeForm = document.getElementById('add-invite-code-form');
    const newInviteCodeInput = document.getElementById('new-invite-code');
    const newInviteMaxUsesInput = document.getElementById('new-invite-max-uses');
    const inviteCodeMessage = document.getElementById('invite-code-message');
    const inviteCodesList = document.getElementById('invite-codes-list');
    const pluginList = document.getElementById('plugin-list');

    // 主题切换逻辑
    const themeToggleButton = document.getElementById('theme-toggle-button');
    let currentTheme = localStorage.getItem('theme') || 'system'; // 默认跟随系统

    function applyTheme(theme) {
        const body = document.body;
        if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            body.setAttribute('data-theme', theme);
        }
        localStorage.setItem('theme', theme);
        updateThemeButtonText(theme);
    }

    function updateThemeButtonText(theme) {
        if (theme === 'light') {
            themeToggleButton.textContent = '当前: 明亮';
        } else if (theme === 'dark') {
            themeToggleButton.textContent = '当前: 黑暗';
        } else {
            themeToggleButton.textContent = '当前: 跟随系统';
        }
    }

    // 初始化主题
    applyTheme(currentTheme);

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (localStorage.getItem('theme') === 'system') {
            applyTheme('system');
        }
    });

    // 切换主题按钮点击事件
    themeToggleButton.addEventListener('click', () => {
        if (currentTheme === 'system') {
            currentTheme = 'light';
        } else if (currentTheme === 'light') {
            currentTheme = 'dark';
        } else {
            currentTheme = 'system';
        }
        applyTheme(currentTheme);
    });

    // 在 DOMContentLoaded 内部获取 authToken，确保其最新和可用
    const currentUsername = localStorage.getItem('chat_username');
    const isAdmin = localStorage.getItem('chat_isAdmin') === 'true';
    const authToken = localStorage.getItem('chat_token');

    if (!currentUsername || !isAdmin || !authToken) {
        alert('您没有权限访问管理员面板，请以管理员身份登录。');
        window.location.href = '/'; // 重定向回登录页面
        return;
    }

    async function loadAdminPanelData() {
        try {
            const response = await fetch('/admin/users', {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                },
            });
            const data = await response.json();

            if (data.success) {
                renderUserList(data.users);
            } else {
                alert('获取用户列表失败: ' + data.message);
                if (data.message.includes('token') || data.message.includes('授权')) {
                    // JWT 无效或过期，强制重新登录
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.href = '/';
                }
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
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ username, mute: newMuteStatus }),
            });
            const data = await response.json();

            if (data.success) {
                alert(data.message);
                loadAdminPanelData(); // 重新加载用户列表
            } else {
                alert('操作失败: ' + data.message);
                if (data.message.includes('token') || data.message.includes('授权')) {
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.href = '/';
                }
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
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ username, isAdmin: newAdminStatus }),
            });
            const data = await response.json();

            if (data.success) {
                alert(data.message);
                loadAdminPanelData(); // 重新加载用户列表
            } else {
                alert('操作失败: ' + data.message);
                if (data.message.includes('token') || data.message.includes('授权')) {
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.href = '/';
                }
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
                    'Authorization': `Bearer ${authToken}`,
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
                loadInvitationCodes(); // 重新加载邀请码列表
            } else {
                inviteCodeMessage.textContent = data.message;
                inviteCodeMessage.style.color = 'red';
                inviteCodeMessage.style.display = 'block';
                if (data.message.includes('token') || data.message.includes('授权')) {
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.href = '/';
                }
            }
        } catch (error) {
            console.error('添加邀请码请求失败:', error);
            inviteCodeMessage.textContent = '添加邀请码失败';
            inviteCodeMessage.style.color = 'red';
            inviteCodeMessage.style.display = 'block';
        }
    });

    async function loadInvitationCodes() {
        try {
            const response = await fetch('/admin/invitation-codes-list', {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                },
            });
            const data = await response.json();

            if (data.success) {
                renderInvitationCodes(data.codes);
            } else {
                alert('获取邀请码列表失败: ' + data.message);
                if (data.message.includes('token') || data.message.includes('授权')) {
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.href = '/';
                }
            }
        } catch (error) {
            console.error('获取邀请码列表请求失败:', error);
            alert('获取邀请码列表失败');
        }
    }

    function renderInvitationCodes(codes) {
        inviteCodesList.innerHTML = '';
        if (codes.length === 0) {
            inviteCodesList.innerHTML = '<li>暂无邀请码。</li>';
            return;
        }
        codes.forEach(code => {
            const li = document.createElement('li');
            li.className = 'invite-code-item';
            li.innerHTML = `
                <span class="code-text">${code.code}</span>
                <span class="uses-info">已使用: ${code.current_uses} / ${code.max_uses}</span>
            `;
            inviteCodesList.appendChild(li);
        });
    }

    async function loadPlugins() {
        try {
            const response = await fetch('/admin/plugins', {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                },
            });
            const data = await response.json();

            if (data.success) {
                renderPlugins(data.plugins);
            } else {
                alert('获取插件列表失败: ' + data.message);
                if (data.message.includes('token') || data.message.includes('授权')) {
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.href = '/';
                }
            }
        } catch (error) {
            console.error('获取插件列表请求失败:', error);
            alert('获取插件列表失败');
        }
    }

    function renderPlugins(plugins) {
        pluginList.innerHTML = '';
        if (plugins.length === 0) {
            pluginList.innerHTML = '<li>暂无插件。</li>';
            return;
        }
        plugins.forEach(plugin => {
            const li = document.createElement('li');
            li.className = 'plugin-item';
            li.innerHTML = `
                <div class="plugin-info">
                    <h4>${plugin.name} (v${plugin.version || 'N/A'})</h4>
                    <p>${plugin.description || '无描述'}</p>
                </div>
                <button class="plugin-toggle-button ${plugin.enabled ? 'enabled' : 'disabled'}" data-plugin-name="${plugin.name}" data-enabled="${plugin.enabled}">
                    ${plugin.enabled ? '禁用' : '启用'}
                </button>
            `;
            pluginList.appendChild(li);
        });

        pluginList.querySelectorAll('.plugin-toggle-button').forEach(button => {
            button.addEventListener('click', handlePluginToggle);
        });
    }

    async function handlePluginToggle(event) {
        const button = event.target;
        const pluginName = button.dataset.pluginName;
        const isEnabled = button.dataset.enabled === 'true';
        const newStatus = !isEnabled;

        try {
            const response = await fetch('/admin/plugins/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ name: pluginName, enabled: newStatus }),
            });
            const data = await response.json();

            if (data.success) {
                alert(data.message);
                loadPlugins(); // 重新加载插件列表
            } else {
                alert('操作失败: ' + data.message);
                if (data.message.includes('token') || data.message.includes('授权')) {
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.href = '/';
                }
            }
        } catch (error) {
            console.error('切换插件状态请求失败:', error);
            alert('操作失败');
        }
    }

    // 初始加载数据
    loadAdminPanelData();
    loadInvitationCodes();
    loadPlugins();
});