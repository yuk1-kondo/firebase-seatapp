// utils.js - 共通ユーティリティ関数
class SeatAppUtils {
  constructor() {
    this.db = firebase.database();
    this.cache = new Map();
    this.listeners = new Map();
    this.adminPinHash = '158a323a7ba44870f23d96f1516dd70aa48e9a72db4ebb026b0a89e212a208ab';
    this.adminSessionKey = 'seatAppAdminAuthenticated';
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
    const [members, tables, fixed, eventRaw] = await Promise.all([
      this.getData('settings/members'),
      this.getData('settings/tables'),
      this.getData('settings/fixed'),
      this.getData('settings/event')
    ]);

    return {
      members: members || [],
      tables: tables || this.getDefaultTables(),
      fixed: fixed || {},
      event: this.normalizeEventFromDb(eventRaw)
    };
  }

  normalizeEventFromDb(raw) {
    const out = { title: '', listTitle: '', rouletteTitle: '' };
    if (!raw || typeof raw !== 'object') return out;
    ['title', 'listTitle', 'rouletteTitle'].forEach((k) => {
      if (typeof raw[k] === 'string') out[k] = raw[k].trim();
    });
    return out;
  }

  getResolvedEventStrings(event) {
    const e = event && typeof event === 'object' ? event : this.normalizeEventFromDb(event);
    const title = e.title || '';
    const listTitle = e.listTitle || '';
    const rouletteTitle = e.rouletteTitle || '';

    const defaults = {
      listHeading: '桜和会2025 忘年会 座席一覧表',
      indexDocTitle: '桜和会2025 忘年会 リアルタイム座席一覧表',
      rouletteHeading: '桜和会2025 忘年会座席ルーレット',
      rouletteDocTitle: 'ルーレット操作',
      adminDocTitle: '管理者設定画面 - 桜和会2025 忘年会'
    };

    const listHeading = listTitle || (title ? `${title} 座席一覧表` : defaults.listHeading);
    const indexDocTitle = listTitle
      ? `${listTitle} — 座席一覧`
      : (title ? `${title} — リアルタイム座席一覧` : defaults.indexDocTitle);
    const rouletteHeading = rouletteTitle || (title ? `${title} 座席ルーレット` : defaults.rouletteHeading);
    const rouletteDocTitle = rouletteTitle || defaults.rouletteDocTitle;
    const adminDocTitle = title ? `管理者設定画面 — ${title}` : defaults.adminDocTitle;

    return { listHeading, indexDocTitle, rouletteHeading, rouletteDocTitle, adminDocTitle };
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

  // 利用可能座席の計算（未割当の固定席は他者の候補から論理予約として除外）
  getAvailableSeats(allSeats, assignments, memberName, fixedAssignments) {
    const assign = assignments || {};
    const fixed = fixedAssignments || {};
    const assignedSeats = Object.values(assign);

    const reservedSeats = new Set();
    Object.entries(fixed).forEach(([m, seat]) => {
      if (typeof seat !== 'string' || !seat) return;
      if (!assign[m]) reservedSeats.add(seat);
    });

    const fixedSeat = fixed[memberName];

    return allSeats.filter((seat) => {
      if (assignedSeats.includes(seat)) return false;
      if (fixedSeat) {
        return seat === fixedSeat;
      }
      if (reservedSeats.has(seat)) return false;
      return true;
    });
  }

  /**
   * ルーレット回転中の表示用席一覧（UI のみ）。実際の割当可否は getAvailableSeats を使うこと。
   * 論理予約席も含むため、固定席の参加者でも演出で他テーブル記号が出る。
   */
  getVisualRouletteSeats(allSeats, assignments) {
    const list = Array.isArray(allSeats) ? allSeats : [];
    const assign = assignments || {};
    const occupied = new Set(
      Object.values(assign).filter((s) => typeof s === 'string' && s)
    );
    const pool = list.filter((seat) => !occupied.has(seat));
    return pool.length > 0 ? pool : [...list];
  }

  // URLパラメータの取得
  getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  isAdminMode() {
    return this.getUrlParam('admin') === 'true';
  }

  async hashText(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  isAdminAuthenticated() {
    return sessionStorage.getItem(this.adminSessionKey) === 'true';
  }

  setAdminAuthenticated(isAuthenticated) {
    if (isAuthenticated) {
      sessionStorage.setItem(this.adminSessionKey, 'true');
    } else {
      sessionStorage.removeItem(this.adminSessionKey);
    }
  }

  async verifyAdminPin(pin) {
    if (!pin) return false;
    const hash = await this.hashText(String(pin).trim());
    return hash === this.adminPinHash;
  }

  async requireAdminAuth(options = {}) {
    if (this.isAdminAuthenticated()) return true;

    const {
      title = '管理者認証',
      description = '管理機能を使うにはPINコードを入力してください。',
      allowCancel = true
    } = options;

    return new Promise((resolve) => {
      const existing = document.getElementById('adminAuthOverlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'adminAuthOverlay';
      overlay.className = 'admin-auth-overlay';
      overlay.innerHTML = `
        <form class="admin-auth-card" id="adminAuthForm">
          <h2>${title}</h2>
          <p>${description}</p>
          <label for="adminPinInput">PINコード</label>
          <input id="adminPinInput" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" required>
          <div class="admin-auth-error" id="adminAuthError" aria-live="polite"></div>
          <div class="admin-auth-actions">
            <button class="btn btn-primary" type="submit">認証する</button>
            ${allowCancel ? '<button class="btn btn-secondary" type="button" id="adminAuthCancel">キャンセル</button>' : ''}
          </div>
        </form>
      `;

      const finish = (result) => {
        overlay.remove();
        resolve(result);
      };

      overlay.addEventListener('click', (event) => {
        if (allowCancel && event.target === overlay) finish(false);
      });

      document.body.appendChild(overlay);

      const form = document.getElementById('adminAuthForm');
      const input = document.getElementById('adminPinInput');
      const error = document.getElementById('adminAuthError');
      const cancel = document.getElementById('adminAuthCancel');

      if (cancel) {
        cancel.addEventListener('click', () => finish(false));
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.textContent = '';

        try {
          const ok = await this.verifyAdminPin(input.value);
          if (ok) {
            this.setAdminAuthenticated(true);
            finish(true);
            return;
          }

          input.value = '';
          error.textContent = 'PINコードが違います';
          input.focus();
        } catch (authError) {
          console.error('PIN認証エラー:', authError);
          error.textContent = '認証処理でエラーが発生しました';
        }
      });

      setTimeout(() => input.focus(), 0);
    });
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