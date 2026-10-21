import type { ReactNode } from 'react';

export function PageHeading({
  title,
  introduction,
  children,
  actions,
}: {
  title: string;
  introduction?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={actions ? 'page-heading has-actions' : 'page-heading'}>
      <div className="page-heading-main">
        <h1>{title}</h1>
        {introduction && <p>{introduction}</p>}
        {children}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}
