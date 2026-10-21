import type { ReactNode } from 'react';
import { AppSidebar, type WorkspaceKind } from './AppSidebar.js';

const workspacePrefixes = [
  '/app',
  '/profile',
  '/vehicles',
  '/drivers',
  '/carpools',
  '/driver',
  '/admin',
];

export function workspaceKindFor(
  user: { roles: string[] } | null | undefined,
  pathname: string,
): WorkspaceKind | null {
  if (!user) return null;
  const inWorkspace = workspacePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!inWorkspace) return null;
  return user.roles.includes('DRIVER') ? 'driver' : 'customer';
}

export function WorkspaceLayout({
  workspace,
  children,
}: {
  workspace: WorkspaceKind;
  children: ReactNode;
}) {
  return (
    <div className="workspace-layout">
      <AppSidebar workspace={workspace} />
      <div className="workspace-content">{children}</div>
    </div>
  );
}
