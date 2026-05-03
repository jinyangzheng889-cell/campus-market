// ====== State ======
let currentCategory = 'all';
let currentStatus = 'available';
let selectedImages = [];
let currentDetailId = null;
let currentSellerNick = '';

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadItems();
});

// ====== Categories ======
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    const container = document.getElementById('categoryChips');
    const postSelect = document.getElementById('postCategory');

    cats.forEach(cat => {
      // Filter chips
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.dataset.cat = cat.value;
      chip.textContent = cat.label;
      chip.onclick = () => setCategory(cat.value);
      container.appendChild(chip);

      // Post form select
      const opt = document.createElement('option');
      opt.value = cat.value;
      opt.textContent = cat.label;
      postSelect.appendChild(opt);
    });
  } catch (e) {
    console.error('加载分类失败', e);
  }
}

function setCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
  loadItems();
}

function setStatus(status) {
  currentStatus = status;
  document.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === status));
  loadItems();
}

// ====== Load Items ======
async function loadItems() {
  const grid = document.getElementById('itemsGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('itemCount');
  const search = document.getElementById('searchInput').value.trim();
  const sort = document.getElementById('sortSelect').value;

  grid.innerHTML = '<div class="loading">⏳ 加载中...</div>';
  empty.style.display = 'none';

  try {
    const params = new URLSearchParams({
      category: currentCategory,
      status: currentStatus,
      sort
    });
    if (search) params.set('search', search);

    const res = await fetch('/api/items?' + params);
    const { items, total } = await res.json();

    if (items.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      count.textContent = '';
      return;
    }

    empty.style.display = 'none';
    count.textContent = `共 ${total} 件商品`;
    grid.innerHTML = items.map(item => `
      <div class="item-card ${item.sold ? 'sold' : ''}" onclick="openDetail(${item.id})">
        ${item.images && item.images.length > 0
          ? `<img class="card-img" src="${item.images[0]}" alt="${escHtml(item.title)}" loading="lazy">`
          : `<div class="card-img-placeholder">📦</div>`
        }
        ${item.sold ? '<span class="sold-badge">已售出</span>' : ''}
        <div class="card-body">
          <div class="card-title">${escHtml(item.title)}</div>
          <div class="card-meta">
            <span class="card-price"><span class="unit">¥</span>${item.price.toFixed(2)}</span>
            <span class="card-category">${getCategoryLabel(item.category)}</span>
          </div>
          <div class="card-footer">
            <span>📍 ${escHtml(item.location || '校园内')}</span>
            <span>${item.msgCount ? '💬' + item.msgCount : ''} ${timeAgo(item.createdAt)}</span>
          </div>
          ${item.sellerNick ? `<div class="card-seller">👤 ${escHtml(item.sellerNick)}</div>` : ''}
        </div>
      </div>
    `).join('');

  } catch (e) {
    grid.innerHTML = '<div class="loading">❌ 加载失败，请稍后重试</div>';
    console.error(e);
  }
}

// ====== Search Debounce ======
let searchTimer;
function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadItems, 300);
}

// ====== Post Modal ======
function openPostModal() {
  document.getElementById('postModal').classList.add('active');
  document.getElementById('postForm').reset();
  selectedImages = [];
  document.getElementById('imagePreviews').innerHTML = '';
  document.getElementById('submitBtn').disabled = false;
  document.body.style.overflow = 'hidden';
}

function closePostModal() {
  document.getElementById('postModal').classList.remove('active');
  selectedImages = [];
  document.getElementById('imagePreviews').innerHTML = '';
  document.body.style.overflow = '';
}

function previewImages(event) {
  const files = Array.from(event.target.files);
  const previews = document.getElementById('imagePreviews');

  files.forEach(file => {
    if (selectedImages.length >= 6) {
      showToast('最多上传6张图片', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过5MB', 'error');
      return;
    }
    selectedImages.push(file);

    const reader = new FileReader();
    reader.onload = e => {
      const div = document.createElement('div');
      div.className = 'preview-item';
      div.innerHTML = `
        <img src="${e.target.result}" alt="preview">
        <button class="preview-remove" onclick="removeImage(event, '${file.name}')">✕</button>
      `;
      previews.appendChild(div);
    };
    reader.readAsDataURL(file);
  });

  event.target.value = '';
}

function removeImage(event, name) {
  event.stopPropagation();
  selectedImages = selectedImages.filter(f => f.name !== name);
  event.target.closest('.preview-item').remove();
}

async function submitPost(event) {
  event.preventDefault();

  const title = document.getElementById('postTitle').value.trim();
  const price = document.getElementById('postPrice').value;
  const category = document.getElementById('postCategory').value;
  const contact = document.getElementById('postContact').value.trim();

  if (!title || !price || !category || !contact) {
    showToast('请填写必填项（标题、价格、分类、联系方式）', 'error');
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '发布中...';

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', document.getElementById('postDesc').value.trim());
  formData.append('price', price);
  formData.append('category', category);
  formData.append('condition', document.getElementById('postCondition').value);
  formData.append('contact', contact);
  formData.append('location', document.getElementById('postLocation').value.trim() || '校园内');
  formData.append('sellerNick', document.getElementById('postSellerNick').value.trim() || '卖家');
  selectedImages.forEach(img => formData.append('images', img));

  try {
    const res = await fetch('/api/items', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '发布失败');
    }
    showToast('🎉 商品发布成功！', 'success');
    closePostModal();
    loadItems();
  } catch (e) {
    showToast(e.message || '发布失败，请重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '发布商品';
  }
}

// ====== Detail Modal ======
async function openDetail(id) {
  try {
    const res = await fetch('/api/items/' + id);
    if (!res.ok) throw new Error('商品不存在');
    const item = await res.json();

    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    const body = document.getElementById('detailBody');
    const condLabels = { new: '🆕 全新', like_new: '✨ 几乎全新', good: '👍 良好', fair: '👌 一般', old: '📦 较旧' };

    // Store current item context for messaging
    currentDetailId = item.id;
    currentSellerNick = item.sellerNick || '卖家';

    body.innerHTML = `
      ${item.images && item.images.length > 0
        ? `<div class="detail-images">${item.images.map(img => `<img src="${img}" alt="" onclick="window.open('${img}')">`).join('')}</div>`
        : `<div class="detail-images"><div class="detail-img-placeholder">📦</div></div>`
      }
      <div class="detail-price">¥${item.price.toFixed(2)}</div>
      <div class="detail-meta">
        <span class="detail-tag">${getCategoryLabel(item.category)}</span>
        <span class="detail-tag">${condLabels[item.condition] || item.condition}</span>
        <span class="detail-tag">📍 ${escHtml(item.location || '校园内')}</span>
        <span class="detail-tag">👁 ${item.views || 0} 次浏览</span>
        <span class="detail-tag">🕐 ${new Date(item.createdAt).toLocaleString('zh-CN')}</span>
      </div>
      ${item.description ? `<div class="detail-desc">${escHtml(item.description)}</div>` : ''}
      <div class="detail-contact">
        📞 联系方式：<strong>${escHtml(item.contact)}</strong>
      </div>
      ${item.sold
        ? '<div style="text-align:center;padding:12px;background:#fef2f2;border-radius:8px;color:#ef4444;font-weight:600;">🔴 该商品已售出</div>'
        : `<div class="detail-actions">
            <button class="btn btn-primary" onclick="startPrivateChat(${item.id}, '${escJs(item.sellerNick || \"卖家\")}')">💬 私信卖家</button>
            <button class="btn btn-secondary btn-sm" onclick="markSold(${item.id})">标记为已售</button>
            <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">删除商品</button>
          </div>`
      }
    `;

    // Load messages
    loadMessages(item.id);

    // Restore chat nickname from localStorage
    const savedNick = localStorage.getItem('chatNickname');
    if (savedNick) document.getElementById('chatNickname').value = savedNick;
  } catch (e) {
    showToast('加载商品详情失败', 'error');
  }
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('active');
  document.body.style.overflow = '';
  currentDetailId = null;
}

async function markSold(id) {
  if (!confirm('确定要将该商品标记为已售吗？')) return;
  try {
    await fetch('/api/items/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sold: true })
    });
    showToast('已标记为售出', 'success');
    closeDetailModal();
    loadItems();
  } catch (e) {
    showToast('操作失败', 'error');
  }
}

async function deleteItem(id) {
  if (!confirm('确定要删除该商品吗？此操作不可恢复！')) return;
  try {
    const res = await fetch('/api/items/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('删除失败');
    showToast('商品已删除', 'success');
    closeDetailModal();
    loadItems();
  } catch (e) {
    showToast('删除失败', 'error');
  }
}

// ====== Click outside modal to close ======
document.getElementById('postModal').addEventListener('click', function(e) {
  if (e.target === this) closePostModal();
});
document.getElementById('detailModal').addEventListener('click', function(e) {
  if (e.target === this) closeDetailModal();
});
document.getElementById('inboxModal').addEventListener('click', function(e) {
  if (e.target === this) closeInbox();
});
document.getElementById('chatModal').addEventListener('click', function(e) {
  if (e.target === this) closeChat();
});

// ====== Keyboard: ESC to close modals ======
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closePostModal();
    closeDetailModal();
    if (currentChatConvId) { closeChat(); return; }
    closeInbox();
  }
});

// ====== Toast ======
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ====== Messages ======
async function loadMessages(itemId) {
  const container = document.getElementById('chatMessages');
  const count = document.getElementById('chatCount');

  try {
    const res = await fetch(`/api/items/${itemId}/messages`);
    const { messages, sellerNick } = await res.json();
    currentSellerNick = sellerNick;

    count.textContent = messages.length > 0 ? `${messages.length} 条留言` : '';

    if (messages.length === 0) {
      container.innerHTML = '<div class="chat-empty">暂无留言，来问点什么吧~</div>';
      return;
    }

    const myNick = document.getElementById('chatNickname').value.trim();

    container.innerHTML = messages.map(m => {
      const isMe = myNick && m.nickname === myNick;
      const isSeller = m.isSeller;
      let cls = isMe ? 'self' : 'other';
      if (isSeller && !isMe) cls += ' seller';
      else if (isSeller && isMe) cls += ' seller';

      return `
        <div class="chat-bubble ${cls}">
          <div class="bubble-meta">
            <span>${escHtml(m.nickname)}</span>
            ${isSeller ? '<span class="bubble-seller-badge">卖家</span>' : ''}
            <span>${timeAgo(m.createdAt)}</span>
          </div>
          <div class="bubble-content">${escHtml(m.content)}</div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  } catch (e) {
    console.error('加载留言失败', e);
  }
}

async function sendMessage() {
  const nickname = document.getElementById('chatNickname').value.trim();
  const content = document.getElementById('chatContent').value.trim();

  if (!nickname) return showToast('请先填写你的昵称', 'error');
  if (!content) return;
  if (!currentDetailId) return;

  // Save nickname
  localStorage.setItem('chatNickname', nickname);

  const input = document.getElementById('chatContent');
  input.disabled = true;

  try {
    const res = await fetch(`/api/items/${currentDetailId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, content })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    input.value = '';
    await loadMessages(currentDetailId);
    // Update msg count on the card if visible
    loadItems();
  } catch (e) {
    showToast(e.message || '发送失败', 'error');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

// ====== Helpers ======
const catLabels = {
  textbook: '📚 教材书籍', electronics: '💻 电子产品', daily: '🏠 生活用品',
  sports: '⚽ 运动器材', clothing: '👗 服饰鞋包', stationery: '✏️ 文具办公',
  entertainment: '🎮 娱乐周边', other: '📦 其他'
};
function getCategoryLabel(cat) { return catLabels[cat] || cat; }

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escJs(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + '分钟前';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + '小时前';
  const day = Math.floor(hr / 24);
  if (day < 30) return day + '天前';
  return new Date(ts).toLocaleDateString('zh-CN');
}

// ====== Private Chat (Inbox) ======
let currentChatConvId = null;
let chatPollTimer = null;
let inboxPollTimer = null;

function openInbox() {
  document.getElementById('inboxModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  const saved = localStorage.getItem('chatNickname');
  if (saved) {
    document.getElementById('inboxNickname').value = saved;
    loadInbox();
  }
  // Start polling for new messages
  inboxPollTimer = setInterval(() => {
    const nick = document.getElementById('inboxNickname').value.trim();
    if (nick && document.getElementById('inboxModal').classList.contains('active')) {
      refreshBadge(nick);
    }
  }, 5000);
}

function closeInbox() {
  document.getElementById('inboxModal').classList.remove('active');
  document.body.style.overflow = '';
  clearInterval(inboxPollTimer);
}

async function loadInbox() {
  const nickname = document.getElementById('inboxNickname').value.trim();
  if (!nickname) {
    document.getElementById('inboxList').innerHTML = '<div class="inbox-empty">👆 请先输入你的昵称</div>';
    return;
  }
  localStorage.setItem('chatNickname', nickname);

  try {
    const res = await fetch('/api/conversations?nickname=' + encodeURIComponent(nickname));
    const { conversations } = await res.json();
    const list = document.getElementById('inboxList');

    if (conversations.length === 0) {
      list.innerHTML = '<div class="inbox-empty">📭 暂无私信对话<br><small>去浏览商品，点击「私信卖家」开启对话</small></div>';
      return;
    }

    list.innerHTML = conversations.map(c => `
      <div class="inbox-item" onclick="openChat(${c.id}, '${escJs(c.partner)}', '${escJs(c.itemTitle)}')">
        <div class="inbox-item-left">
          <div class="inbox-avatar">${c.role === 'seller' ? '🏪' : '🛒'}</div>
          <div class="inbox-item-info">
            <div class="inbox-item-name">
              ${escHtml(c.partner)}
              <span class="inbox-role">${c.role === 'seller' ? '卖家' : '买家'}</span>
            </div>
            <div class="inbox-item-preview">${escHtml(c.lastMsg || '（新对话）')}</div>
            <div class="inbox-item-meta">关于：${escHtml(c.itemTitle)} · ${timeAgo(c.lastTime || c.updatedAt)}</div>
          </div>
        </div>
        ${c.unread > 0 ? `<span class="inbox-unread">${c.unread}</span>` : ''}
      </div>
    `).join('');

    refreshBadge(nickname);
  } catch (e) {
    console.error('加载私信失败', e);
  }
}

async function refreshBadge(nickname) {
  try {
    const res = await fetch('/api/conversations?nickname=' + encodeURIComponent(nickname));
    const { conversations } = await res.json();
    const total = conversations.reduce((s, c) => s + c.unread, 0);
    const badge = document.getElementById('inboxBadge');
    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : total;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {}
}

// Start a private chat from item detail
async function startPrivateChat(itemId, sellerNick) {
  const nickname = localStorage.getItem('chatNickname');
  if (!nickname) {
    showToast('请先在私信里设置你的昵称', 'error');
    document.getElementById('detailModal').classList.remove('active');
    openInbox();
    return;
  }

  if (nickname === sellerNick) {
    showToast('这是你自己发布的商品哦', 'error');
    return;
  }

  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, buyerNick: nickname })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    const conv = await res.json();
    document.getElementById('detailModal').classList.remove('active');
    openChat(conv.id, sellerNick, conv.itemTitle);
  } catch (e) {
    showToast(e.message || '发起私信失败', 'error');
  }
}

async function openChat(convId, partner, itemTitle) {
  currentChatConvId = convId;
  document.getElementById('inboxModal').classList.remove('active');
  clearInterval(inboxPollTimer);

  document.getElementById('chatPartner').textContent = '💬 ' + partner;
  document.getElementById('chatItemTitle').textContent = '📦 ' + itemTitle;
  document.getElementById('chatModal').classList.add('active');
  document.getElementById('chatMsgInput').focus();

  await refreshChat();

  // Poll for new messages every 3 seconds
  chatPollTimer = setInterval(refreshChat, 3000);
}

function closeChat() {
  document.getElementById('chatModal').classList.remove('active');
  document.body.style.overflow = '';
  currentChatConvId = null;
  clearInterval(chatPollTimer);
}

function backToInbox() {
  closeChat();
  openInbox();
}

async function refreshChat() {
  if (!currentChatConvId) return;
  const nickname = localStorage.getItem('chatNickname');
  if (!nickname) return;

  try {
    const res = await fetch(`/api/conversations/${currentChatConvId}?nickname=${encodeURIComponent(nickname)}`);
    const conv = await res.json();
    const body = document.getElementById('chatBody');

    if (conv.messages.length === 0) {
      body.innerHTML = '<div class="chat-empty">开始你们的私密对话吧 💬</div>';
    } else {
      body.innerHTML = conv.messages.map(m => {
        const isMe = m.nickname === nickname;
        return `
          <div class="chat-msg ${isMe ? 'chat-msg-self' : ''}">
            <div class="chat-msg-bubble">${escHtml(m.content)}</div>
            <div class="chat-msg-time">${escHtml(m.nickname)} · ${timeAgo(m.createdAt)}</div>
          </div>
        `;
      }).join('');
      body.scrollTop = body.scrollHeight;
    }

    // Refresh inbox badge
    refreshBadge(nickname);
  } catch (e) {
    console.error('刷新私信失败', e);
  }
}

async function sendPrivateMsg() {
  const input = document.getElementById('chatMsgInput');
  const content = input.value.trim();
  if (!content || !currentChatConvId) return;

  const nickname = localStorage.getItem('chatNickname');
  if (!nickname) return;

  input.disabled = true;
  try {
    const res = await fetch(`/api/conversations/${currentChatConvId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, content })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    input.value = '';
    await refreshChat();
  } catch (e) {
    showToast(e.message || '发送失败', 'error');
  } finally {
    input.disabled = false;
    input.focus();
  }
}
