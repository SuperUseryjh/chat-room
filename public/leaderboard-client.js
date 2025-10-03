document.addEventListener('DOMContentLoaded', () => {
    const leaderboardTabButtons = document.querySelectorAll('.leaderboard-tab-button');
    const leaderboardList = document.getElementById('leaderboard-list');
    const leaderboardMessage = document.getElementById('leaderboard-message');

    const authToken = localStorage.getItem('chat_token');

    if (!authToken) {
        alert('您没有权限访问排行榜，请登录。');
        window.location.href = '/'; // 重定向回登录页面
        return;
    }

    leaderboardTabButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            leaderboardTabButtons.forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            const timeframe = event.target.dataset.timeframe;
            loadLeaderboard(timeframe);
        });
    });

    async function loadLeaderboard(timeframe) {
        leaderboardList.innerHTML = ''; // 清空列表
        leaderboardMessage.style.display = 'none';

        try {
            const response = await fetch(`/scores/${timeframe}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                },
            });
            const data = await response.json();

            if (data.success) {
                if (data.scores.length > 0) {
                    data.scores.forEach((score, index) => {
                        const li = document.createElement('li');
                        li.innerHTML = `<span class="rank">${index + 1}</span> <span class="username">${score.username}</span> <span class="score">${score.score} 次</span>`;
                        if (index === 0) li.classList.add('rank-1');
                        if (index === 1) li.classList.add('rank-2');
                        if (index === 2) li.classList.add('rank-3');
                        leaderboardList.appendChild(li);
                    });
                } else {
                    leaderboardMessage.textContent = '暂无数据';
                    leaderboardMessage.style.display = 'block';
                }
            } else {
                leaderboardMessage.textContent = '获取排行榜失败: ' + data.message;
                leaderboardMessage.style.display = 'block';
                if (data.message.includes('token') || data.message.includes('授权')) {
                    localStorage.removeItem('chat_token');
                    localStorage.removeItem('chat_username');
                    localStorage.removeItem('chat_isAdmin');
                    window.location.href = '/';
                }
            }
        } catch (error) {
            console.error('获取排行榜请求失败:', error);
            leaderboardMessage.textContent = '获取排行榜失败，请稍后再试';
            leaderboardMessage.style.display = 'block';
        }
    }

    // 默认加载单日排行榜
    loadLeaderboard('daily');
});