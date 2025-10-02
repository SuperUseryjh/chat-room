const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { registerUser, verifyUser, saveMessage, getRecentMessages, getAllUsers, updateUserAdminStatus, addInvitationCode, getInvitationCode, decrementInvitationCodeUses, muteUser, unmuteUser, isUserMuted } = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const users = {}; // 存储在线用户 { socket.id: { username, isAdmin } }
const initialAdminUsername = process.env.INITIAL_ADMIN_USERNAME || 'admin';
const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'adminpass';

// 初始化管理员账户
registerUser(initialAdminUsername, initialAdminPassword, true, (err, user) => {
  if (err && !err.message.includes('UNIQUE constraint failed')) {
    console.error('创建初始管理员失败:', err.message);
  } else if (!err) {
    console.log('初始管理员账户已创建或已存在');
  }
});

app.use(express.static('public'));
app.use(express.json()); // 用于解析 JSON 请求体

// 简单的管理员认证中间件
const adminAuth = (req, res, next) => {
  const username = req.headers['x-username']; // 从请求头获取���户名
  const isAdmin = req.headers['x-isadmin'] === 'true'; // 从请求头获取管理员状态

  if (isAdmin) {
    next();
  } else {
    res.status(403).json({ success: false, message: '未经授权' });
  }
};

// 注册路由
app.post('/register', (req, res) => {
  const { username, password, invitationCode } = req.body;
  if (!username || !password || !invitationCode) {
    return res.status(400).json({ success: false, message: '用户名、密码和邀请码不能为空' });
  }

  getInvitationCode(invitationCode, (err, codeEntry) => {
    if (err || !codeEntry || codeEntry.current_uses >= codeEntry.max_uses) {
      return res.status(403).json({ success: false, message: '无效或已用尽的邀请码' });
    }

    registerUser(username, password, false, (err, user) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ success: false, message: '用户名已被占用' });
        }
        console.error('注册用户失败:', err.message);
        return res.status(500).json({ success: false, message: '注册失败' });
      }

      decrementInvitationCodeUses(invitationCode, (err, success) => {
        if (err || !success) {
          console.error('递减邀请码使用次数失败:', err ? err.message : '未知错误');
          // 注册成功但邀请码更新失败，需要处理回滚或日志记录
        }
        res.status(201).json({ success: true, message: '注册成功' });
      });
    });
  });
});

// 管理员面板 API
app.get('/admin/users', adminAuth, (req, res) => {
  getAllUsers((err, users) => {
    if (err) {
      console.error('获取用户列表失败:', err.message);
      return res.status(500).json({ success: false, message: '获取用户列表失败' });
    }
    res.json({ success: true, users: users });
  });
});

app.post('/admin/mute', adminAuth, (req, res) => {
  const { username, mute } = req.body;
  if (!username || typeof mute !== 'boolean') {
    return res.status(400).json({ success: false, message: '用户名和禁言状态不能为空' });
  }

  const action = mute ? muteUser : unmuteUser;
  action(username, (err, success) => {
    if (err || !success) {
      console.error(`${mute ? '禁言' : '解禁'}用户失败:`, err ? err.message : '未知错误');
      return res.status(500).json({ success: false, message: `${mute ? '禁言' : '解禁'}用户失败` });
    }
    io.emit('user muted status', { username, isMuted: mute }); // 通知所有客户端用户禁言状态变化
    res.json({ success: true, message: `${username} 已${mute ? '禁言' : '解禁'}` });
  });
});

app.post('/admin/invitation-codes', adminAuth, (req, res) => {
  const { code, maxUses } = req.body;
  if (!code || !maxUses || maxUses <= 0) {
    return res.status(400).json({ success: false, message: '邀请码和有效使用次数不能为空且必须大于0' });
  }

  addInvitationCode(code, maxUses, (err, newCode) => {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ success: false, message: '邀请码已存在' });
      }
      console.error('添加邀请码失败:', err.message);
      return res.status(500).json({ success: false, message: '添加邀请码失败' });
    }
    res.status(201).json({ success: true, message: '邀请码添加成功', code: newCode });
  });
});

app.post('/admin/set-admin', adminAuth, (req, res) => {
  const { username, isAdmin } = req.body;
  if (!username || typeof isAdmin !== 'boolean') {
    return res.status(400).json({ success: false, message: '用户名和管理员状态不能为空' });
  }

  if (username === initialAdminUsername && !isAdmin) {
    return res.status(403).json({ success: false, message: '初始管理员不能被取消管理员身份' });
  }

  updateUserAdminStatus(username, isAdmin, (err, success) => {
    if (err || !success) {
      console.error(`���置用户 ${username} 管理员状态失败:`, err ? err.message : '未知错误');
      return res.status(500).json({ success: false, message: `设置用户 ${username} 管理员状态失败` });
    }
    io.emit('user admin status', { username, isAdmin }); // 通知所有客户端用户管理员状态变化
    res.json({ success: true, message: `用户 ${username} 已${isAdmin ? '设置为' : '取消'}管理员` });
  });
});

io.on('connection', (socket) => {
  console.log('新用户连接:', socket.id);

  // 处理登录
  socket.on('login', (credentials, callback) => {
    const { username, password } = credentials;
    verifyUser(username, password, (err, user) => {
      if (err) {
        console.error('验证用户失败:', err.message);
        return callback({ success: false, message: '登录失败' });
      }
      if (user) {
        if (Object.values(users).some(u => u.username === username)) {
          return callback({ success: false, message: '用户已在线' });
        }
        users[socket.id] = { username: user.username, isAdmin: user.isAdmin };
        callback({ success: true, username: user.username, isAdmin: user.isAdmin });
        io.emit('user joined', user.username); // 通知所有客户端有新用户加入
        console.log(`用户 ${user.username} 登录成功 (管���员: ${user.isAdmin})`);

        // 发送最近的聊天记录给新登录的用户
        getRecentMessages(50, (err, messages) => {
          if (err) {
            console.error('获取历史消息失败:', err.message);
            return;
          }
          socket.emit('history messages', messages);
        });

      } else {
        callback({ success: false, message: '用户名或密码错误' });
      }
    });
  });

  // 处理聊天消息
  socket.on('chat message', (msg) => {
    const user = users[socket.id];
    if (user) {
      isUserMuted(user.username, (err, isMuted) => {
        if (err) {
          console.error('检查用户禁言状态失败:', err.message);
          return socket.emit('chat error', '发送消息失败');
        }
        if (isMuted) {
          return socket.emit('chat error', '你已被禁言，无法发送消息。');
        }

        saveMessage(user.username, msg, (err, savedMsg) => {
          if (err) {
            console.error('保存消息失败:', err.message);
            return socket.emit('chat error', '发送消息失败');
          }
          io.emit('chat message', { username: user.username, message: msg, timestamp: savedMsg.timestamp }); // 广播消息给所有客户端
          console.log(`[${user.username}]: ${msg}`);
        });
      });
    }
  });

  // 处理用户断开连接
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      delete users[socket.id];
      io.emit('user left', user.username); // 通知所有客户端有用户离开
      console.log(`用户 ${user.username} 断开连接`);
    }
    console.log('用户断开连接:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
