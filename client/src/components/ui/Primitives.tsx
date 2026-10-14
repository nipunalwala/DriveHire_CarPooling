import {
  useState,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode
} from 'react';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ui-input" {...props} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="ui-input" {...props} />;
}
export function Card({ children }: { children: ReactNode }) {
  return <section className="feature-card">{children}</section>;
}
export function FormField({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
      {error && (
        <small className="form-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
export function StarRating({
  value,
  onChange
}: {
  value: number;
  onChange?: (value: number) => void;
}) {
  return (
    <div
      className="star-rating"
      role={onChange ? 'group' : 'img'}
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) =>
        onChange ? (
          <button
            type="button"
            key={star}
            aria-label={`${star} stars`}
            aria-pressed={value === star}
            onClick={() => onChange(star)}
          >
            {star <= value ? '★' : '☆'}
          </button>
        ) : (
          <span key={star} aria-hidden="true">
            {star <= value ? '★' : '☆'}
          </span>
        )
      )}
    </div>
  );
}
export function Tabs({ items }: { items: { label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div role="tablist" className="ui-tabs">
        {items.map((item, index) => (
          <button
            role="tab"
            aria-selected={active === index}
            key={item.label}
            onClick={() => setActive(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section role="tabpanel">{items[active]?.content}</section>
    </div>
  );
}
export function Pagination({
  page,
  pages,
  onChange
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="ui-pagination" aria-label="Pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="ui-stepper">
      {steps.map((step, index) => (
        <li key={step} aria-current={index === current ? 'step' : undefined}>
          <span>{index < current ? '✓' : index + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}
export function Timeline({ items }: { items: { title: string; detail: string }[] }) {
  return (
    <ol className="ui-timeline">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`}>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
        </li>
      ))}
    </ol>
  );
}
export function Table({ headings, rows }: { headings: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="form-field">
      {label}
      <select className="ui-input" defaultValue="">
        <option value="" disabled>
          Select {label.toLowerCase()}
        </option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
export function Checkbox({ label }: { label: string }) {
  return (
    <label className="checkbox-field">
      <input type="checkbox" /> {label}
    </label>
  );
}
export function Switch({ label }: { label: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <button
      className={`switch ${checked ? 'on' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => setChecked(!checked)}
    >
      {label}
    </button>
  );
}
export function FileDropzone({ accept, onFile }: { accept: string; onFile: (file: File) => void }) {
  return (
    <label className="dropzone">
      Choose a file or drop it here
      <input
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-label={name}>
      {name
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()}
    </span>
  );
}
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="tooltip" tabIndex={0} aria-label={label}>
      {children}
      <span role="tooltip">{label}</span>
    </span>
  );
}
export function Dialog({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="dialog-close" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
        <h2 id="dialog-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}
