/* ============================================================
 * net-client.js —— 《璀璨宝石》联机客户端（浏览器端 WebSocket）
 *
 * 与 server.js 配合：创建/加入房间、发送操作指令、接收服务器
 * 广播的房间信息与状态快照。单机模式完全不依赖本文件。
 *
 * 消息协议（客户端 -> 服务器）：
 *   {type:'createRoom', playerCount, aiLevel, name}
 *   {type:'joinRoom', roomId, name}
 *   {type:'resumeRoom', roomId, resumeToken} 自动断线回座
 *   {type:'startGame'}            房主开始（AI 补位由服务器完成）
 *   {type:'action', action:{...}} 操作指令，action 类型：
 *       {type:'take', colors:[...]}         拿取宝石（3 异色 或 2 同色）
 *       {type:'buy', cardId}                购买公开卡
 *       {type:'reserve', cardId}            明牌预留
 *       {type:'blindReserve', tier}         盲留（暗抽，tier=1|2|3）
 *       {type:'returnToken', color}         归还阶段逐枚归还
 *       {type:'finishDiscard'}              归还完成
 *       {type:'chooseNoble', nobleId}       多贵族择一
 *   {type:'restart'}            房主重新开始
 *
 * 消息协议（服务器 -> 客户端）：
 *   {type:'roomInfo', roomId, mySeat, playerCount, started, seats:[{name,connected}]}
 *   {type:'state', state, mySeat, roomId, started}
 *   {type:'error', message}
 * ============================================================ */
(function (root) {
  'use strict';

  var RESUME_KEY = 'splendor.resume.v1';
  function loadResume() {
    try {
      if (!root.sessionStorage) return null;
      var value = JSON.parse(root.sessionStorage.getItem(RESUME_KEY) || 'null');
      return value && value.roomId && value.resumeToken ? value : null;
    } catch (e) { return null; }
  }
  function saveResume(roomId, resumeToken) {
    try {
      if (root.sessionStorage && roomId && resumeToken) {
        root.sessionStorage.setItem(RESUME_KEY, JSON.stringify({ roomId: roomId, resumeToken: resumeToken }));
      }
    } catch (e) { /* ignore */ }
  }
  function clearResume() {
    try { if (root.sessionStorage) root.sessionStorage.removeItem(RESUME_KEY); } catch (e) { /* ignore */ }
  }

  var savedResume = loadResume();

  var Net = {
    ws: null,
    connected: false,
    roomId: savedResume ? savedResume.roomId : null,
    resumeToken: savedResume ? savedResume.resumeToken : null,
    mySeat: -1,
    playerCount: 0,
    started: false,
    seats: [],          // [{name, connected}]
    pending: [],        // 连接建立前排队的创建/加入等消息
    reconnectTimer: null,
    reconnectAttempt: 0,
    manualClose: false,
    serverUrl: null,
    // 回调（由 ui.js 注册）
    onRoomInfo: null,   // (info)
    onState: null,      // (state, meta:{mySeat})
    onError: null,      // (message)
    onStatus: null,     // (message) 连接状态提示

    /** 连接服务器（url 缺省时自动使用当前页面地址） */
    connect: function (url) {
      var self = this;
      // 已连接或正在连接时复用当前连接，避免重复建立 WebSocket。
      if (self.ws && (self.ws.readyState === 0 || self.ws.readyState === 1)) return true;
      if (typeof WebSocket === 'undefined') {
        if (self.onStatus) self.onStatus('当前环境不支持联机连接');
        return false;
      }
      var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      var wsUrl = url || self.serverUrl || proto + location.host;
      self.serverUrl = wsUrl;
      self.manualClose = false;
      if (self.reconnectTimer) clearTimeout(self.reconnectTimer);
      self.reconnectTimer = null;
      var socket;
      try {
        socket = new WebSocket(wsUrl);
        self.ws = socket;
      } catch (e) {
        self.ws = null;
        if (self.onStatus) self.onStatus('无法连接服务器');
        return false;
      }
      socket.onopen = function () {
        if (self.ws !== socket) return;
        self.connected = true;
        self.reconnectAttempt = 0;
        if (self.onStatus) self.onStatus('已连接服务器');
        if (self.roomId && self.resumeToken) {
          socket.send(JSON.stringify({ type: 'resumeRoom', roomId: self.roomId, resumeToken: self.resumeToken }));
        }
        // 用户可能在连接尚未完成时点击创建/加入；连接成功后按顺序补发。
        var queued = self.pending.splice(0);
        for (var i = 0; i < queued.length; i++) {
          socket.send(JSON.stringify(queued[i]));
        }
      };
      socket.onclose = function (ev) {
        if (self.ws !== socket) return;
        self.connected = false;
        if (ev && ev.code === 4001) {
          self.manualClose = true;
          if (self.onStatus) self.onStatus('该座位已在另一个页面恢复连接');
          return;
        }
        var canRetry = (self.roomId && self.resumeToken) || self.pending.length > 0;
        if (self.onStatus) self.onStatus(canRetry ? '与服务器连接已断开，正在尝试恢复…' : '与服务器连接已断开');
        if (!self.manualClose && canRetry) self._scheduleReconnect();
      };
      socket.onerror = function () {
        if (self.onStatus) self.onStatus('无法连接服务器');
      };
      socket.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type === 'roomInfo') {
          self.roomId = msg.roomId;
          if (msg.resumeToken) self.resumeToken = msg.resumeToken;
          self.mySeat = msg.mySeat;
          self.playerCount = msg.playerCount;
          self.started = msg.started;
          self.seats = msg.seats || [];
          saveResume(self.roomId, self.resumeToken);
          if (self.onRoomInfo) self.onRoomInfo(msg);
        } else if (msg.type === 'state') {
          self.started = msg.started;
          self.roomId = msg.roomId;
          if (self.onState) self.onState(msg.state, { mySeat: msg.mySeat });
        } else if (msg.type === 'error') {
          if (msg.code === 'RESUME_FAILED') {
            self.roomId = null;
            self.resumeToken = null;
            self.started = false;
            clearResume();
          }
          if (self.onError) self.onError(msg.message);
        }
      };
      return true;
    },

    _scheduleReconnect: function () {
      var self = this;
      if (self.reconnectTimer || self.manualClose) return;
      var delay = Math.min(5000, 500 * Math.pow(2, Math.min(self.reconnectAttempt++, 4)));
      self.reconnectTimer = setTimeout(function () {
        self.reconnectTimer = null;
        if (!self.manualClose && !self.connected) self.connect(self.serverUrl);
      }, delay);
    },

    close: function () {
      this.manualClose = true;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } }
      this.ws = null;
      this.connected = false;
      this.roomId = null;
      this.resumeToken = null;
      this.mySeat = -1;
      this.started = false;
      this.pending = [];
      clearResume();
    },

    _send: function (obj) {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(obj));
        return true;
      }
      // WebSocket 建连是异步的：先排队，连接成功后由 onopen 自动发送。
      this.pending.push(obj);
      if (this.ws && this.ws.readyState === 0) return true;
      if (this.connect()) return true;
      this.pending.pop();
      return false;
    },

    createRoom: function (playerCount, aiLevel, name) {
      return this._send({ type: 'createRoom', playerCount: playerCount, aiLevel: aiLevel, name: name });
    },
    joinRoom: function (roomId, name) {
      return this._send({ type: 'joinRoom', roomId: String(roomId), name: name });
    },
    startGame: function () { return this._send({ type: 'startGame' }); },
    action: function (action) {
      if (!this.ws || this.ws.readyState !== 1 || !this.connected) {
        if (this.onStatus) this.onStatus('连接尚未恢复，操作未提交');
        return false;
      }
      this.ws.send(JSON.stringify({ type: 'action', action: action }));
      return true;
    },
    restart: function () { return this._send({ type: 'restart' }); },
    hasResumeSession: function () { return !!(this.roomId && this.resumeToken); }
  };

  root.SplendorNet = Net;
})(typeof self !== 'undefined' ? self : this);
