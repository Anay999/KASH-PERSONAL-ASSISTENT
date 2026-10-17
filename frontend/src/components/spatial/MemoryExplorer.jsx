import React, { useState, useEffect } from 'react';
import { Database, Plus, Trash2, Search, Tag, Key, Check } from 'lucide-react';

/**
 * MemoryExplorer: Spatial Persistent Memory Vault.
 * Directly interfaces with the backend SQLite database via /api/memories.
 */
export const MemoryExplorer = () => {
  const [memories, setMemories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [valInput, setValInput] = useState('');
  const [category, setCategory] = useState('preference');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMemories = async () => {
    try {
      const resp = await fetch('/api/memories');
      if (resp.ok) {
        const data = await resp.json();
        setMemories(data);
      }
    } catch (e) {
      console.warn('[MemoryExplorer] Failed loading memories:', e);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleAddMemory = async (e) => {
    e.preventDefault();
    if (!keyInput.trim() || !valInput.trim()) return;
    setIsSubmitting(true);
    try {
      const resp = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyInput.trim(), value: valInput.trim(), category })
      });
      if (resp.ok) {
        setKeyInput('');
        setValInput('');
        setShowAddForm(false);
        fetchMemories();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const resp = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        setMemories(prev => prev.filter(m => m.id !== id));
      }
    } catch (e) {
      console.error('[MemoryExplorer] Delete error:', e);
    }
  };

  const filtered = memories.filter(m => {
    const q = searchTerm.toLowerCase();
    return (
      m.key.toLowerCase().includes(q) ||
      m.value.toLowerCase().includes(q) ||
      (m.category && m.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className="memory-explorer-container">
      {/* Search & Actions Bar */}
      <div className="memory-controls-bar">
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--color-cyan-glow)' }} />
          <input
            type="text"
            className="memory-search-input"
            style={{ paddingLeft: 32 }}
            placeholder="Search persistent SQLite memories by keyword or tag..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button
          className="spatial-btn-icon"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus size={13} />
          <span>{showAddForm ? 'Cancel' : 'New Memory'}</span>
        </button>
      </div>

      {/* Add Memory Modal/Form */}
      {showAddForm && (
        <form onSubmit={handleAddMemory} style={{
          background: 'rgba(3, 7, 13, 0.8)',
          border: '1px solid var(--color-cyan-glow)',
          borderRadius: 4,
          padding: 14,
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder="Key identifier (e.g. user_name, project_goal)"
              className="conv-input-field"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              required
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                background: 'rgba(6, 16, 28, 0.9)',
                border: '1px solid rgba(0, 229, 255, 0.25)',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                padding: '6px 10px',
                borderRadius: 4
              }}
            >
              <option value="preference">Preference</option>
              <option value="fact">Fact</option>
              <option value="project">Project</option>
              <option value="general">General</option>
            </select>
          </div>
          <textarea
            placeholder="Memory content or context to remember across conversations..."
            className="conv-input-field"
            style={{ minHeight: 60, resize: 'vertical' }}
            value={valInput}
            onChange={(e) => setValInput(e.target.value)}
            required
          />
          <button
            type="submit"
            className="conv-send-btn"
            style={{ alignSelf: 'flex-end' }}
            disabled={isSubmitting}
          >
            <Check size={13} />
            <span>{isSubmitting ? 'Persisting...' : 'Save to SQLite'}</span>
          </button>
        </form>
      )}

      {/* Memory Grid */}
      <div className="memory-grid">
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {searchTerm ? 'No stored memories matching filter.' : 'Persistent memory vault is currently empty.'}
          </div>
        ) : (
          filtered.map((mem) => (
            <div key={mem.id} className="memory-card">
              <div className="memory-card-header">
                <span className="memory-tag">#{mem.category || 'general'}</span>
                <button
                  className="spatial-panel-btn close"
                  onClick={() => handleDelete(mem.id)}
                  title="Purge Memory"
                >
                  <Trash2 size={11} />
                </button>
              </div>

              <div>
                <div className="memory-key">{mem.key}</div>
                <div className="memory-val">{mem.value}</div>
              </div>

              <div className="memory-date">
                ID #{mem.id} • {mem.created_at ? new Date(mem.created_at).toLocaleDateString() : 'Active'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
