let currentUser = null;
let currentSection = 'alumni';
let currentCategory = '';
let currentSearch = '';

const roleNames = {
    'alumni': '校友',
    'student': '在校生',
    'teacher': '教师'
};

function init() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMain();
        loadQuestions();
        checkNotifications();
    }
}

function showLogin() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
}

function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            currentUser = data;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showMain();
            loadQuestions();
            checkNotifications();
        } else {
            alert(data.error || '登录失败');
        }
    } catch (error) {
        alert('登录失败，请稍后重试');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const role = document.getElementById('register-role').value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const data = await response.json();
        if (response.ok) {
            alert('注册成功，请登录');
            showLogin();
        } else {
            alert(data.error || '注册失败');
        }
    } catch (error) {
        alert('注册失败，请稍后重试');
    }
}

function showMain() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
    document.getElementById('user-info').textContent = 
        `${currentUser.username} (${roleNames[currentUser.role]})`;
    
    if (currentUser.role === 'teacher') {
        document.getElementById('admin-btn').style.display = 'inline-block';
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    document.getElementById('auth-container').style.display = 'block';
    document.getElementById('main-container').style.display = 'none';
    showLogin();
}

function switchSection(section) {
    currentSection = section;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${section}`).classList.add('active');
    loadQuestions();
}

function filterByCategory(category) {
    currentCategory = category;
    document.querySelectorAll('.category-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.category === category) {
            item.classList.add('active');
        }
    });
    loadQuestions();
}

async function searchQuestions() {
    currentSearch = document.getElementById('search-input').value;
    loadQuestions();
}

async function loadQuestions() {
    let url = `/api/questions?section=${currentSection}`;
    if (currentCategory) {
        url += `&category=${encodeURIComponent(currentCategory)}`;
    }
    if (currentSearch) {
        url += `&search=${encodeURIComponent(currentSearch)}`;
    }

    try {
        const response = await fetch(url);
        const questions = await response.json();
        renderQuestions(questions);
    } catch (error) {
        alert('加载问题失败');
    }
}

function renderQuestions(questions) {
    const container = document.getElementById('questions-list');
    if (questions.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 40px;">暂无问题</p>';
        return;
    }

    container.innerHTML = questions.map(q => `
        <div class="question-card" onclick="viewQuestion(${q.id})">
            <div class="question-header">
                <div class="question-title">【问题】${escapeHtml(q.title)}</div>
                <span class="question-status ${q.status === 'resolved' ? 'status-resolved' : 'status-open'}">
                    ${q.status === 'resolved' ? '已解决' : '未解决'}
                </span>
            </div>
            <div style="text-align: right; margin-bottom: 10px;">
                -${escapeHtml(q.username)} (${roleNames[q.role]})
            </div>
            <div class="question-meta">
                <span>【回复】${q.answer_count} 个</span>
                <span>【关注】${q.follow_count} 个</span>
                <span>分类: ${escapeHtml(q.category)}</span>
                <span>${formatDate(q.created_at)}</span>
            </div>
        </div>
    `).join('');
}

function showAskQuestionModal() {
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <h2>发布问题</h2>
        <form onsubmit="submitQuestion(event)">
            <div class="form-group">
                <label>问题标题</label>
                <input type="text" id="question-title" required>
            </div>
            <div class="form-group">
                <label>问题分类</label>
                <select id="question-category" required>
                    <option value="">请选择分类</option>
                    <option value="动植物产品">动植物产品</option>
                    <option value="矿化产品">矿化产品</option>
                    <option value="纺织产品">纺织产品</option>
                    <option value="金属制品">金属制品</option>
                    <option value="机电及仪器仪表">机电及仪器仪表</option>
                    <option value="交通运输设备">交通运输设备</option>
                    <option value="其他商品">其他商品</option>
                </select>
            </div>
            <div class="form-group">
                <label>问题内容</label>
                <textarea id="question-content" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary">发布</button>
            <button type="button" class="btn" onclick="closeModal()">取消</button>
        </form>
    `;
    document.getElementById('question-modal').style.display = 'block';
}

async function submitQuestion(e) {
    e.preventDefault();
    const title = document.getElementById('question-title').value;
    const content = document.getElementById('question-content').value;
    const category = document.getElementById('question-category').value;

    try {
        const response = await fetch('/api/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                content,
                category,
                user_id: currentUser.id,
                section: currentSection
            })
        });
        if (response.ok) {
            closeModal();
            loadQuestions();
        } else {
            alert('发布失败');
        }
    } catch (error) {
        alert('发布失败，请稍后重试');
    }
}

async function viewQuestion(id) {
    try {
        const response = await fetch(`/api/questions/${id}`);
        const data = await response.json();
        renderQuestionDetail(data);
    } catch (error) {
        alert('加载问题详情失败');
    }
}

function renderQuestionDetail(data) {
    const { question, answers } = data;
    const isOwner = question.user_id === currentUser.id;
    const isTeacher = currentUser.role === 'teacher';
    
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h2>${escapeHtml(question.title)}</h2>
                <span class="question-status ${question.status === 'resolved' ? 'status-resolved' : 'status-open'}">
                    ${question.status === 'resolved' ? '已解决' : '未解决'}
                </span>
            </div>
            <div style="color: #7f8c8d; margin-bottom: 15px;">
                发布者: ${escapeHtml(question.username)} (${roleNames[question.role]}) | 
                分类: ${escapeHtml(question.category)} | 
                ${formatDate(question.created_at)}
            </div>
            <div style="white-space: pre-wrap; margin-bottom: 20px;">${escapeHtml(question.content)}</div>
            
            <div class="question-actions">
                <button class="btn btn-primary" onclick="followQuestion(${question.id})">关注问题</button>
                ${(isOwner || isTeacher) ? `
                    <button class="btn btn-warning" onclick="editQuestion(${question.id})">编辑</button>
                    <button class="btn btn-danger" onclick="deleteQuestion(${question.id})">删除</button>
                    ${question.status === 'open' ? `<button class="btn btn-success" onclick="resolveQuestion(${question.id})">标记已解决</button>` : ''}
                ` : ''}
            </div>
            
            <hr style="margin: 25px 0;">
            
            <h3>回答 (${answers.length})</h3>
            ${answers.map(a => `
                <div class="answer-card">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <strong>${escapeHtml(a.username)} (${roleNames[a.role]})</strong>
                        <span style="color: #7f8c8d; font-size: 12px;">${formatDate(a.created_at)}</span>
                    </div>
                    <div style="white-space: pre-wrap;">${escapeHtml(a.content)}</div>
                </div>
            `).join('')}
            
            <div style="margin-top: 25px;">
                <h3>添加回答</h3>
                <div class="form-group">
                    <textarea id="answer-content" placeholder="请输入您的回答..." required></textarea>
                </div>
                <button class="btn btn-primary" onclick="submitAnswer(${question.id})">提交回答</button>
            </div>
        </div>
    `;
    document.getElementById('question-modal').style.display = 'block';
}

async function editQuestion(id) {
    try {
        const response = await fetch(`/api/questions/${id}`);
        const data = await response.json();
        const question = data.question;
        
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2>编辑问题</h2>
            <form onsubmit="updateQuestion(event, ${id})">
                <div class="form-group">
                    <label>问题标题</label>
                    <input type="text" id="edit-question-title" value="${escapeHtml(question.title)}" required>
                </div>
                <div class="form-group">
                    <label>问题分类</label>
                    <select id="edit-question-category" required>
                        <option value="动植物产品" ${question.category === '动植物产品' ? 'selected' : ''}>动植物产品</option>
                        <option value="矿化产品" ${question.category === '矿化产品' ? 'selected' : ''}>矿化产品</option>
                        <option value="纺织产品" ${question.category === '纺织产品' ? 'selected' : ''}>纺织产品</option>
                        <option value="金属制品" ${question.category === '金属制品' ? 'selected' : ''}>金属制品</option>
                        <option value="机电及仪器仪表" ${question.category === '机电及仪器仪表' ? 'selected' : ''}>机电及仪器仪表</option>
                        <option value="交通运输设备" ${question.category === '交通运输设备' ? 'selected' : ''}>交通运输设备</option>
                        <option value="其他商品" ${question.category === '其他商品' ? 'selected' : ''}>其他商品</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>问题内容</label>
                    <textarea id="edit-question-content" required>${escapeHtml(question.content)}</textarea>
                </div>
                <div class="form-group">
                    <label>状态</label>
                    <select id="edit-question-status">
                        <option value="open" ${question.status === 'open' ? 'selected' : ''}>未解决</option>
                        <option value="resolved" ${question.status === 'resolved' ? 'selected' : ''}>已解决</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary">保存</button>
                <button type="button" class="btn" onclick="viewQuestion(${id})">取消</button>
            </form>
        `;
    } catch (error) {
        alert('加载问题失败');
    }
}

async function updateQuestion(e, id) {
    e.preventDefault();
    const title = document.getElementById('edit-question-title').value;
    const content = document.getElementById('edit-question-content').value;
    const category = document.getElementById('edit-question-category').value;
    const status = document.getElementById('edit-question-status').value;

    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, category, status, user_id: currentUser.id, role: currentUser.role })
        });
        if (response.ok) {
            viewQuestion(id);
            loadQuestions();
        } else {
            alert('更新失败');
        }
    } catch (error) {
        alert('更新失败');
    }
}

async function deleteQuestion(id) {
    if (!confirm('确定要删除这个问题吗？')) return;
    
    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, role: currentUser.role })
        });
        if (response.ok) {
            closeModal();
            loadQuestions();
        } else {
            alert('删除失败');
        }
    } catch (error) {
        alert('删除失败');
    }
}

async function resolveQuestion(id) {
    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                status: 'resolved', 
                user_id: currentUser.id, 
                role: currentUser.role,
                title: '',
                content: '',
                category: ''
            })
        });
        if (response.ok) {
            viewQuestion(id);
            loadQuestions();
        } else {
            alert('操作失败');
        }
    } catch (error) {
        alert('操作失败');
    }
}

async function followQuestion(id) {
    try {
        const response = await fetch(`/api/questions/${id}/follow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id })
        });
        if (response.ok) {
            alert('关注成功');
            loadQuestions();
        }
    } catch (error) {
        alert('关注失败');
    }
}

async function submitAnswer(questionId) {
    const content = document.getElementById('answer-content').value;
    if (!content.trim()) {
        alert('请输入回答内容');
        return;
    }

    try {
        const response = await fetch(`/api/questions/${questionId}/answers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, user_id: currentUser.id })
        });
        if (response.ok) {
            viewQuestion(questionId);
            loadQuestions();
        } else {
            alert('提交失败');
        }
    } catch (error) {
        alert('提交失败');
    }
}

async function showNotifications() {
    try {
        const response = await fetch(`/api/notifications/${currentUser.id}`);
        const notifications = await response.json();
        
        const list = document.getElementById('notifications-list');
        if (notifications.length === 0) {
            list.innerHTML = '<p style="padding: 20px; text-align: center; color: #7f8c8d;">暂无通知</p>';
        } else {
            list.innerHTML = notifications.map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}" 
                     onclick="markAsRead(${n.id}, ${n.question_id})">
                    ${escapeHtml(n.message)}
                    <div style="font-size: 12px; color: #7f8c8d; margin-top: 5px;">${formatDate(n.created_at)}</div>
                </div>
            `).join('');
        }
        document.getElementById('notifications-panel').style.display = 'block';
    } catch (error) {
        alert('加载通知失败');
    }
}

async function markAsRead(id, questionId) {
    try {
        await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
        closeNotifications();
        if (questionId) {
            viewQuestion(questionId);
        }
    } catch (error) {
        console.error('标记已读失败');
    }
}

async function checkNotifications() {
    try {
        const response = await fetch(`/api/notifications/${currentUser.id}`);
        const notifications = await response.json();
        const unreadCount = notifications.filter(n => !n.is_read).length;
        if (unreadCount > 0) {
            document.getElementById('notification-btn').textContent = `通知 (${unreadCount})`;
        }
    } catch (error) {
        console.error('检查通知失败');
    }
}

function closeNotifications() {
    document.getElementById('notifications-panel').style.display = 'none';
}

async function showAdminPanel() {
    if (currentUser.role !== 'teacher') {
        alert('只有教师可以访问管理面板');
        return;
    }
    await loadAdminUsers();
    document.getElementById('admin-panel').style.display = 'block';
}

function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.admin-tab[data-tab="${tab}"]`).classList.add('active');
}

async function loadAdminUsers() {
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        
        const container = document.getElementById('admin-users');
        container.innerHTML = `
            <table class="user-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>用户名</th>
                        <th>角色</th>
                        <th>注册时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>${u.id}</td>
                            <td>${escapeHtml(u.username)}</td>
                            <td><span class="role-badge role-${u.role}">${roleNames[u.role]}</span></td>
                            <td>${formatDate(u.created_at)}</td>
                            <td>
                                ${u.id !== currentUser.id ? `<button class="btn btn-danger action-btn" onclick="deleteUser(${u.id})">删除</button>` : '-'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        alert('加载用户列表失败');
    }
}

async function deleteUser(id) {
    if (!confirm('确定要删除这个用户吗？')) return;
    
    try {
        const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        if (response.ok) {
            loadAdminUsers();
        } else {
            alert('删除失败');
        }
    } catch (error) {
        alert('删除失败');
    }
}

function closeModal() {
    document.getElementById('question-modal').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

window.onclick = function(event) {
    const modal = document.getElementById('question-modal');
    const adminModal = document.getElementById('admin-panel');
    const notificationsPanel = document.getElementById('notifications-panel');
    
    if (event.target === modal) {
        modal.style.display = 'none';
    }
    if (event.target === adminModal) {
        adminModal.style.display = 'none';
    }
    if (!notificationsPanel.contains(event.target) && 
        event.target.id !== 'notification-btn') {
        notificationsPanel.style.display = 'none';
    }
}

init();
