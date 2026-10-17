import React, { useState, useEffect } from 'react';
import { X, Database, Plus, Trash2, Key, Tag, FileText } from 'lucide-react';

/**
 * Memory Management Drawer.
 * Inspects, adds, and clears SQLite persistent memories and past conversations.
 */
export const MemoryDrawer = ({ isOpen, onClose }) => {
  const [memories, setMemories] = useState([]);
  const [keyInput, setKeyInput] = useState('');
  const [valInput, setValInput] = useState('');
  const [category, setCategory] = useState('preference');
  const [loading, setLoading] = useState(false);

  const fetchMemories = async () => {
    try {
      const resp = await fetch('/api/memories');
      if (resp.ok) {
        const data = await resp.json();
        setMemories(data);
      }
    } catch (e) {
      console.error('Failed to load memories:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
    }
  }, [isOpen]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!keyInput.trim() || !valInput.trim()) return;
    setLoading(true);
    try {
      const resp = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyInput.trim(), value: valInput.trim(), category })
      });
      if (resp.ok) {
        setKeyInput('');
        setValInput('');
        fetchMemories();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const resp = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        setMemories(memories.filter(m => m.id !== id));
      }
    } catch (e) {
      console.error('Failed deleting memory:', e);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you wish to purge all stored persistent memories?')) return;
    try {
      const resp = await fetch('/api/memories/clear', { method: 'POST' });
      if (resp.ok) {
        setMemories([]);
      }
    } catch (e) {
      console.error('Failed clearing memories:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-wrap">
            <Database size={18} className="drawer-icon" />
            <h3>PERSISTENT MEMORY VAULT</h3>
          </div>
          <button className="drawer-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="drawer-description">
          Memories stored here in SQLite are continuously accessible to JARVIS across conversations.
        </p>

        {/* Add Memory Form */}
        <form className="add-memory-form" onSubmit={handleAdd}>
          <div className="form-row">
            <div className="input-group">
              <label>Key / Tag</label>
              <input
                type="text"
                placeholder="e.g. user_designation"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="preference">Preference</option>
                <option value="fact">Fact</option>
                <option value="project">Project</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label>Memory Value</label>
            <input
              type="text"
              placeholder="e.g. Address user as Commander; prefers concise answers."
              value={valInput}
              onChange={(e) => setValInput(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="save-mem-btn" disabled={loading}>
            <Plus size={15} />
            <span>Save Memory</span>
          </button>
        </form>

        <div className="memories-section">
          <div className="memories-header">
            <h4>STORED RECORDS ({memories.length})</h4>
            {memories.length > 0 && (
              <button className="clear-vault-btn" onClick={handleClearAll}>
                Purge All
              </button>
            )}
          </div>

          {memories.length === 0 ? (
            <div className="empty-memories">
              <FileText size={32} />
              <p>No persistent memories saved yet.</p>
            </div>
          ) : (
            <div className="memories-list">
              {memories.map((m) => (
                <div key={m.id} className="memory-card">
                  <div className="mem-card-top">
                    <span className="mem-key">
                      <Key size={12} /> {m.key}
                    </span>
                    <span className={`mem-category-tag tag-${m.category}`}>
                      {m.category}
                    </span>
                    <button
                      className="del-mem-btn"
                      onClick={() => handleDelete(m.id)}
                      title="Delete memory"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mem-value">{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
