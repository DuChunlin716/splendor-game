/* ============================================================
 * net-client.js —— 《璀璨宝石》联机客户端（浏览器端 WebSocket）
 *
 * 与 server.js 配合：创建/加入房间、发送操作指令、接收服务器
 * 广播的房间信息与状态快照。单机模式完全不依赖本文件。
 *
 * 消息协议（客户端 -> 服务器）：
 *   {type:'createRoom', playerCount, aiLevel, name}
 *   {type:'joinRoom', roomId, name}
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

  var Net = {
    ws: null,
    connected: false,
    roomId: null,
    mySeat: -1,
    playerCount: 0,
    started: false,
    seats: [],          // [{name, connected}]
    // 回调（由 ui.js 注册）
    onRoomInfo: null,   // (info)
    onState: null,      // (state, meta:{mySeat})
    onError: null,      // (message)
    onStatus: null,     // (message) 连接状态提示

    /** 连接服务器（url 缺省时自动使用当前页面地址） */
    connect: function (url) {
      var self = this;
      var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      var wsUrl = url || proto + location.host;
      if (self.ws) { try { self.ws.close(); } catch (e) { /* ignore */ } }
      self.ws = new WebSocket(wsUrl);
      self.ws.onopen = function () {
        self.connected = true;
        if (self.onStatus) self.onStatus('已连接服务器');
      };
      self.ws.onclose = function () {
        self.connected = false;
        if (self.onStatus) self.onStatus('与服务器连接已断开');
      };
      self.ws.onerror = function () {
        if (self.onStatus) self.onStatus('无法连接服务器');
      };
      self.ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type === 'roomInfo') {
          self.roomId = msg.roomId;
          self.mySeat = msg.mySeat;
          self.playerCount = msg.playerCount;
          self.started = msg.started;
          self.seats = msg.seats || [];
          if (self.onRoomInfo) self.onRoomInfo(msg);
        } else if (msg.type === 'state') {
          self.started = msg.started;
          self.roomId = msg.roomId;
          if (self.onState) self.onState(msg.state, { mySeat: msg.mySeat });
        } else if (msg.type === 'error') {
          if (self.onError) self.onError(msg.message);
        }
      };
    },

    close: function () {
      if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } }
      this.ws = null;
      this.connected = false;
      this.roomId = null;
      this.mySeat = -1;
      this.started = false;
    },

    _send: function (obj) {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(obj));
        return true;
      }
      return false;
    },

    createRoom: function (playerCount, aiLevel, name) {
      return this._send({ type: 'createRoom', playerCount: playerCount, aiLevel: aiLevel, name: name });
    },
    joinRoom: function (roomId, name) {
      return this._send({ type: 'joinRoom', roomId: String(roomId), name: name });
    },
    startGame: function () { return this._send({ type: 'startGame' }); },
    action: function (action) { return this._send({ type: 'action', action: action }); },
    restart: function () { return this._send({ type: 'restart' }); }
  };

  root.SplendorNet = Net;
})(typeof self !== 'undefined' ? self : this);
