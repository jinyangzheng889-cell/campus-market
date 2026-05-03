const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure directories exist
[UPLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Load data
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { items: [], nextId: 1 };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Init data
if (!fs.existsSync(DATA_FILE)) {
  saveData({ items: [], messages: [], conversations: [], nextId: 1, nextMsgId: 1, nextConvId: 1 });
}

// Multer config
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== API Routes ======

// Get all items (with search, filter, sort)
app.get('/api/items', (req, res) => {
  const { search, category, sort, status } = req.query;
  const data = loadData();
  let items = [...data.items];

  // Filter: only show available by default unless status=all or status=sold
  if (status === 'sold') {
    items = items.filter(i => i.sold);
  } else if (status !== 'all') {
    items = items.filter(i => !i.sold);
  }

  // Search
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q)
    );
  }

  // Category filter
  if (category && category !== 'all') {
    items = items.filter(i => i.category === category);
  }

  // Sort
  if (sort === 'price_asc') {
    items.sort((a, b) => a.price - b.price);
  } else if (sort === 'price_desc') {
    items.sort((a, b) => b.price - a.price);
  } else {
    // default: newest first
    items.sort((a, b) => b.createdAt - a.createdAt);
  }

  res.json({ items, total: items.length });
});

// Get single item
app.get('/api/items/:id', (req, res) => {
  const data = loadData();
  const item = data.items.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: '商品不存在' });
  res.json(item);
});

// Create item
app.post('/api/items', upload.array('images', 6), (req, res) => {
  const { title, description, price, category, condition, contact, location } = req.body;
  if (!title || !price || !category || !contact) {
    return res.status(400).json({ error: '请填写完整信息（标题、价格、分类、联系方式必填）' });
  }

  const data = loadData();
  const images = req.files ? req.files.map(f => '/uploads/' + f.filename) : [];

  const sellerNick = req.body.sellerNick || '卖家';

  const item = {
    id: data.nextId++,
    title: title.trim(),
    description: (description || '').trim(),
    price: parseFloat(price),
    category,
    condition: condition || 'good',
    contact: contact.trim(),
    location: (location || '校园内').trim(),
    sellerNick: sellerNick.trim(),
    images,
    sold: false,
    createdAt: Date.now(),
    views: 0,
    msgCount: 0
  };

  data.items.push(item);
  saveData(data);
  res.status(201).json(item);
});

// Update item (mark sold)
app.put('/api/items/:id', (req, res) => {
  const data = loadData();
  const item = data.items.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: '商品不存在' });

  if (req.body.sold !== undefined) item.sold = req.body.sold;
  item.updatedAt = Date.now();

  saveData(data);
  res.json(item);
});

// Delete item
app.delete('/api/items/:id', (req, res) => {
  const data = loadData();
  const idx = data.items.findIndex(i => i.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '商品不存在' });

  const [removed] = data.items.splice(idx, 1);
  // Clean up images
  removed.images.forEach(img => {
    const fpath = path.join(__dirname, 'public', img);
    if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
  });

  saveData(data);
  res.json({ success: true });
});

// ====== Messages ======

// Get messages for an item
app.get('/api/items/:id/messages', (req, res) => {
  const data = loadData();
  const item = data.items.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: '商品不存在' });

  const msgs = (data.messages || [])
    .filter(m => m.itemId === item.id)
    .sort((a, b) => a.createdAt - b.createdAt);

  res.json({ messages: msgs, sellerNick: item.sellerNick });
});

// Post a message
app.post('/api/items/:id/messages', (req, res) => {
  const data = loadData();
  const itemId = parseInt(req.params.id);
  const item = data.items.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error: '商品不存在' });

  const { nickname, content } = req.body;
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: '请输入昵称' });
  if (!content || !content.trim()) return res.status(400).json({ error: '请输入留言内容' });

  if (!data.messages) data.messages = [];
  if (!data.nextMsgId) data.nextMsgId = 1;

  const msg = {
    id: data.nextMsgId++,
    itemId,
    nickname: nickname.trim(),
    content: content.trim(),
    isSeller: nickname.trim() === item.sellerNick,
    createdAt: Date.now()
  };

  data.messages.push(msg);
  item.msgCount = (item.msgCount || 0) + 1;
  saveData(data);
  res.status(201).json(msg);
});

// ====== Private Conversations ======

// Start or get existing private conversation
app.post('/api/conversations', (req, res) => {
  const { itemId, buyerNick } = req.body;
  if (!itemId || !buyerNick || !buyerNick.trim()) {
    return res.status(400).json({ error: '参数不完整' });
  }

  const data = loadData();
  const item = data.items.find(i => i.id === parseInt(itemId));
  if (!item) return res.status(404).json({ error: '商品不存在' });

  const sellerNick = item.sellerNick || '卖家';
  const bn = buyerNick.trim();

  if (bn === sellerNick) return res.status(400).json({ error: '不能私信自己发布的商品' });

  if (!data.conversations) data.conversations = [];
  if (!data.nextConvId) data.nextConvId = 1;

  // Find existing conversation
  let conv = data.conversations.find(c =>
    c.itemId === item.id &&
    ((c.buyerNick === bn && c.sellerNick === sellerNick) ||
     (c.buyerNick === sellerNick && c.sellerNick === bn))
  );

  if (!conv) {
    conv = {
      id: data.nextConvId++,
      itemId: item.id,
      itemTitle: item.title,
      buyerNick: bn,
      sellerNick,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    data.conversations.push(conv);
    saveData(data);
  }

  res.json(conv);
});

// List my conversations
app.get('/api/conversations', (req, res) => {
  const { nickname } = req.query;
  if (!nickname || !nickname.trim()) return res.json({ conversations: [] });

  const data = loadData();
  const me = nickname.trim();

  const convs = (data.conversations || [])
    .filter(c => c.buyerNick === me || c.sellerNick === me)
    .map(c => {
      const lastMsg = c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
      const unread = (c.messages || []).filter(m => m.nickname !== me && !m.read).length;
      return {
        id: c.id,
        itemId: c.itemId,
        itemTitle: c.itemTitle,
        partner: c.buyerNick === me ? c.sellerNick : c.buyerNick,
        role: c.buyerNick === me ? 'buyer' : 'seller',
        lastMsg: lastMsg ? lastMsg.content : '',
        lastTime: lastMsg ? lastMsg.createdAt : c.updatedAt,
        unread,
        updatedAt: c.updatedAt
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  res.json({ conversations: convs });
});

// Get a conversation with messages
app.get('/api/conversations/:id', (req, res) => {
  const data = loadData();
  const conv = (data.conversations || []).find(c => c.id === parseInt(req.params.id));
  if (!conv) return res.status(404).json({ error: '对话不存在' });

  const { nickname } = req.query;

  // Mark messages from the other party as read
  if (nickname) {
    conv.messages.forEach(m => {
      if (m.nickname !== nickname.trim()) m.read = true;
    });
    saveData(data);
  }

  res.json(conv);
});

// Send a message in a conversation
app.post('/api/conversations/:id/messages', (req, res) => {
  const data = loadData();
  const conv = (data.conversations || []).find(c => c.id === parseInt(req.params.id));
  if (!conv) return res.status(404).json({ error: '对话不存在' });

  const { nickname, content } = req.body;
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: '请输入昵称' });
  if (!content || !content.trim()) return res.status(400).json({ error: '不能发送空消息' });

  const nn = nickname.trim();
  if (nn !== conv.buyerNick && nn !== conv.sellerNick) {
    return res.status(403).json({ error: '你不是该对话的参与者' });
  }

  const msg = {
    id: conv.messages.length + 1,
    nickname: nn,
    content: content.trim(),
    read: false,
    createdAt: Date.now()
  };

  conv.messages.push(msg);
  conv.updatedAt = Date.now();
  saveData(data);
  res.status(201).json(msg);
});

// Categories list
app.get('/api/categories', (req, res) => {
  res.json([
    { value: 'textbook', label: '📚 教材书籍', icon: '📚' },
    { value: 'electronics', label: '💻 电子产品', icon: '💻' },
    { value: 'daily', label: '🏠 生活用品', icon: '🏠' },
    { value: 'sports', label: '⚽ 运动器材', icon: '⚽' },
    { value: 'clothing', label: '👗 服饰鞋包', icon: '👗' },
    { value: 'stationery', label: '✏️ 文具办公', icon: '✏️' },
    { value: 'entertainment', label: '🎮 娱乐周边', icon: '🎮' },
    { value: 'other', label: '📦 其他', icon: '📦' }
  ]);
});

app.listen(PORT, () => {
  console.log(`🏫 校园二手交易平台已启动: http://localhost:${PORT}`);
});
