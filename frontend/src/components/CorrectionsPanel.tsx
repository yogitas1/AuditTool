import React from 'react';

export interface Correction {
  timestamp: string;
  file: string;
  sheet: string;
  row_id: string;
  column: string;
  old_value: string | number | null;
  new_value: string | number | null;
  reason: string;
}

interface Props {
  corrections: Correction[];
  isOpen: boolean;
  onToggle: () => void;
  onDownload: (filename: string) => void;
  modifiedFiles: string[];
}

const CorrectionsPanel: React.FC<Props> = ({
  corrections,
  isOpen,
  onToggle,
  onDownload,
  modifiedFiles,
}) => {
  if (corrections.length === 0) return null;

  return (
    <div className={`cp ${isOpen ? 'cp--open' : ''}`}>
      <button className="cp__header" onClick={onToggle}>
        <div className="cp__header-left">
          <span className="cp__total">
            {corrections.length} correction{corrections.length !== 1 ? 's' : ''} applied
          </span>
        </div>
        <div className="cp__header-right">
          {modifiedFiles.map((f) => (
            <button
              key={f}
              className="cp__download-btn"
              onClick={(e) => { e.stopPropagation(); onDownload(f); }}
              title={`Download corrected ${f}`}
            >
              {f}
            </button>
          ))}
          <span className={`cp__chevron ${isOpen ? '' : 'cp__chevron--collapsed'}`}>
            ▾
          </span>
        </div>
      </button>

      <div className="cp__body">
        <table className="cp__table">
          <thead>
            <tr>
              <th>File</th>
              <th>Sheet</th>
              <th>Row</th>
              <th>Column</th>
              <th>Old</th>
              <th>New</th>
            </tr>
          </thead>
          <tbody>
            {corrections.map((c, i) => (
              <tr key={i}>
                <td className="cp__cell--file">{c.file}</td>
                <td>{c.sheet}</td>
                <td className="cp__cell--mono">{c.row_id}</td>
                <td>{c.column}</td>
                <td className="cp__cell--old">{String(c.old_value ?? '—')}</td>
                <td className="cp__cell--new">{String(c.new_value ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CorrectionsPanel;
