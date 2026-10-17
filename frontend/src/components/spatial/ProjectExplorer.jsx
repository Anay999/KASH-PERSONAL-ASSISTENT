import React, { useState, useEffect } from 'react';
import { Folder, FileCode, FileText, ChevronRight, HardDrive, Eye } from 'lucide-react';

/**
 * ProjectExplorer: Spatial repository file and workspace tree.
 * Queries /api/projects/tree to show real local project contents.
 */
export const ProjectExplorer = () => {
  const [treeData, setTreeData] = useState({ workspace: '', items: [] });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTree = async () => {
    try {
      const resp = await fetch('/api/projects/tree');
      if (resp.ok) {
        const data = await resp.json();
        setTreeData(data);
      }
    } catch (e) {
      console.warn('[ProjectExplorer] Tree fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, []);

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Workspace Root Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'rgba(0, 229, 255, 0.05)',
        border: '1px solid rgba(0, 229, 255, 0.15)',
        borderRadius: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--color-cyan-glow)'
      }}>
        <HardDrive size={13} />
        <span>WORKSPACE: {treeData.workspace || 'c:\\Users\\anayp\\New folder'}</span>
      </div>

      {/* Directory & File Tree List */}
      <div className="project-tree-container">
        {treeData.items.map((item) => (
          <div
            key={item.name}
            className="project-tree-item"
            onClick={() => setSelectedFile(item.name)}
          >
            <div className="tree-item-left">
              {item.is_dir ? (
                <Folder size={14} style={{ color: 'var(--color-cyan-glow)' }} />
              ) : item.name.endsWith('.md') ? (
                <FileText size={14} style={{ color: '#ffaa00' }} />
              ) : (
                <FileCode size={14} style={{ color: '#00f5a0' }} />
              )}
              <span style={{ fontWeight: item.is_dir ? 600 : 400 }}>{item.name}</span>
            </div>

            <div className="tree-item-meta">
              {item.is_dir ? `${item.children_count} items` : formatSize(item.size)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
