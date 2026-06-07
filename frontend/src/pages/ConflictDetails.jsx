import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/axios';

const PAGE_SIZE = 50;

const trimAtClientRequestId = (error) => {
  const idx = error.toLowerCase().indexOf('client-request-id');
  if (idx === -1) return error;
  return error.slice(0, idx).trim().replace(/[,;:\s]+$/, '');
};

export default function ConflictDetails() {
  const { databaseId }          = useParams();
  const [searchParams]          = useSearchParams();
  const navigate                = useNavigate();
  const projectName             = searchParams.get('name') || `DB ${databaseId}`;

  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [filter,  setFilter]  = useState('all');   // 'all' | 'channels' | 'dms'
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/projects/conflict-details/${databaseId}`)
      .then(res => {
        setData(res.data.details || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.error || err.message);
        setLoading(false);
      });
  }, [databaseId]);

  const isTrue  = v => v === true || v === 1 || (typeof v === 'string' && (v.toLowerCase() === 'true' || v === '1'));
  const isFalse = v => v === false || v === 0 || (typeof v === 'string' && (v.toLowerCase() === 'false' || v === '0'));

  const filtered = useMemo(() => {
    let rows = data;
    if (filter === 'channels') rows = rows.filter(r => isFalse(r.isDm));
    if (filter === 'dms')      rows = rows.filter(r => isTrue(r.isDm));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.channelName.toLowerCase().includes(q) ||
        r.wsId.toLowerCase().includes(q) ||
        r.error.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = v => { setSearch(v); setPage(1); };
  const handleFilter = v => { setFilter(v); setPage(1); };

  const channelCount = data.filter(r => isFalse(r.isDm)).length;
  const dmsCount     = data.filter(r => isTrue(r.isDm)).length;
  const unknownCount = data.length - channelCount - dmsCount;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9', fontFamily: 'Arial, Helvetica, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#0129ac', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '5px 10px', color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Back
        </button>
        <div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>Conflict Error Details</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>{projectName}</div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280', fontSize: 13 }}>
            Loading conflict errors…
          </div>
        )}

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 16, color: '#DC2626', fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary chips */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { key: 'all',      label: `All Errors`,  count: data.length },
                { key: 'channels', label: 'Channels',    count: channelCount },
                { key: 'dms',      label: 'DMs',         count: dmsCount },
                ...(unknownCount > 0 ? [{ key: 'unknown', label: 'Unknown', count: unknownCount }] : []),
              ].map(chip => (
                <button
                  key={chip.key}
                  onClick={() => handleFilter(chip.key)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: filter === chip.key ? '1.5px solid #0129ac' : '1px solid #e5e7eb',
                    background: filter === chip.key ? '#EFF6FF' : '#fff',
                    color: filter === chip.key ? '#0129ac' : '#374151',
                  }}>
                  {chip.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>({chip.count})</span>
                </button>
              ))}

              {/* Search */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Search channel, WS ID, error…"
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, width: 240, outline: 'none' }}
                />
              </div>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', width: '5%' }}>#</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', width: '25%' }}>Channel Name</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', width: '15%' }}>WS ID (ID)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', width: '10%' }}>Type</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', width: '45%' }}>Error Description</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px 14px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                        No conflict errors found
                      </td>
                    </tr>
                  ) : pageData.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '9px 14px', color: '#9ca3af' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 500, color: '#111827', wordBreak: 'break-word' }}>
                        {row.channelName || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 14px', color: '#374151', fontFamily: 'monospace', fontSize: 11 }}>
                        {row.wsId || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {isFalse(row.isDm)
                          ? <span style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>Channel</span>
                          : isTrue(row.isDm)
                          ? <span style={{ background: '#EDE9FE', color: '#5B21B6', padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>DM</span>
                          : <span style={{ color: '#9ca3af', fontSize: 10 }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 14px', wordBreak: 'break-word', color: row.error ? '#DC2626' : '#9ca3af', fontStyle: row.error ? 'normal' : 'italic' }}>
                        {row.error ? trimAtClientRequestId(row.error) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: '#6b7280' }}>
                <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#d1d5db' : '#374151' }}>
                    ←
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (p === page ? '#0129ac' : '#e5e7eb'), background: p === page ? '#0129ac' : '#fff', color: p === page ? '#fff' : '#374151', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#d1d5db' : '#374151' }}>
                    →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
