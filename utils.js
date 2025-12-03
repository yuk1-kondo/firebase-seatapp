// utils.js - 共通ユーティリティ関数
class SeatAppUtils {
  constructor() {
    this.db = firebase.database();
    this.cache = new Map();
    this.listeners = new Map();
  }

  // Firebase操作の共通メソッド
  async getData(path) {
    try {
      if (this.cache.has(path)) {
        return this.cache.get(path);
      }
      const snapshot = await this.db.ref(path).once('value');
      const data = snapshot.val();
      this.cache.set(path, data);
      return data;
    } catch (error) {
      console.error(`データ取得エラー (${path}):`, error);
      return null;
    }
  }

  async setData(path, data) {
    try {
      await this.db.ref(path).set(data);
      this.cache.set(path, data);
      return true;
    } catch (error) {
      console.error(`データ保存エラー (${path}):`, error);
      return false;
    }
  }

  async removeData(path) {
    try {
      await this.db.ref(path).remove();
      this.cache.delete(path);
      return true;
    } catch (error) {
      console.error(`データ削除エラー (${path}):`, error);
      return false;
    }
  }

  // リアルタイムリスナーの管理
  addListener(path, callback, context = 'default') {
    const listener = this.db.ref(path).on('value', (snapshot) => {
      const data = snapshot.val();
      this.cache.set(path, data);
      callback(data);
    });
    
    if (!this.listeners.has(context)) {
      this.listeners.set(context, []);
    }
    this.listeners.get(context).push({ path, listener });
    
    return listener;
  }

  removeListeners(context = 'default') {
    const contextListeners = this.listeners.get(context);
    if (contextListeners) {
      contextListeners.forEach(({ path, listener }) => {
        this.db.ref(path).off('value', listener);
      });
      this.listeners.delete(context);
    }
  }

  // 設定データの取得
  async getSettings() {
    const [members, tables, fixed] = await Promise.all([
      this.getData('settings/members'),
      this.getData('settings/tables'),
      this.getData('settings/fixed')
    ]);

    return {
      members: members || [],
      tables: tables || this.getDefaultTables(),
      fixed: fixed || {}
    };
  }

  getDefaultTables() {
    return {
      A: 5, B: 5, C: 5, D: 5,
      E: 4, F: 4, G: 4, H: 4,
      I: 6, J: 6, K: 8, L: 7
    };
  }

  // 座席生成
  generateSeats(tables) {
    const seats = [];
    Object.entries(tables).forEach(([block, config]) => {
      // 新しい形式: {seats: number, enabled: boolean} または従来の形式: number
      let count, enabled;
      if (typeof config === 'object') {
        count = config.seats;
        enabled = config.enabled !== false; // undefined の場合は true
      } else {
        count = config;
        enabled = true;
      }
      
      // 無効なテーブルはスキップ
      if (!enabled) return;
      
      for (let i = 1; i <= count; i++) {
        seats.push(`${block}${i}`);
      }
    });
    return seats;
  }

  // 利用可能座席の計算
  getAvailableSeats(allSeats, assignments, memberName, fixedAssignments) {
    const assignedSeats = Object.values(assignments || {});
    const fixedSeat = fixedAssignments[memberName];
    
    return allSeats.filter(seat => {
      if (assignedSeats.includes(seat)) return false;
      if (fixedSeat && seat !== fixedSeat) return false;
      return true;
    });
  }

  // URLパラメータの取得
  getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  isAdminMode() {
    return this.getUrlParam('admin') === 'true';
  }

  // 状態管理
  showMessage(elementId, message, isError = false) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.className = `status ${isError ? 'error' : 'success'}`;
    element.textContent = message;
    
    // 3秒後にメッセージをクリア
    setTimeout(() => {
      element.textContent = '';
      element.className = 'status';
    }, 3000);
  }

  // DOM操作ヘルパー
  createElement(tag, className = '', content = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content) element.textContent = content;
    return element;
  }

  // 確認ダイアログ
  async confirm(message) {
    return new Promise(resolve => {
      const result = window.confirm(message);
      resolve(result);
    });
  }

  // ローディング状態の管理
  setLoading(elementId, isLoading) {
    const element = document.getElementById(elementId);
    if (!element) return;

    if (isLoading) {
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.textContent = '処理中...';
    } else {
      element.disabled = false;
      element.textContent = element.dataset.originalText || element.textContent;
      delete element.dataset.originalText;
    }
  }

  // デバッグ用
  log(message, data = null) {
    if (this.isAdminMode()) {
      console.log(`[SeatApp] ${message}`, data);
    }
  }

  // データバリデーション
  validateTableData(tables) {
    if (!tables || typeof tables !== 'object') return false;
    
    for (const [key, value] of Object.entries(tables)) {
      if (!/^[A-Z]$/.test(key) || !Number.isInteger(value) || value < 1 || value > 20) {
        return false;
      }
    }
    return true;
  }

  validateMembersList(members) {
    if (!Array.isArray(members)) return false;
    return members.every(member => typeof member === 'string' && member.trim().length > 0);
  }

  validateFixedAssignments(fixed, tables) {
    if (!fixed || typeof fixed !== 'object') return true; // 空は有効
    
    const allSeats = this.generateSeats(tables);
    
    for (const [member, seat] of Object.entries(fixed)) {
      if (typeof member !== 'string' || member.trim().length === 0) return false;
      if (typeof seat !== 'string' || !allSeats.includes(seat)) return false;
    }
    return true;
  }

  // クリーンアップ
  destroy() {
    this.listeners.forEach((_, context) => {
      this.removeListeners(context);
    });
    this.cache.clear();
  }
}

// グローバルインスタンス
window.seatAppUtils = new SeatAppUtils();

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
  window.seatAppUtils?.destroy();
});