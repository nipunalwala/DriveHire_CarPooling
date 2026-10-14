import { useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { AuthLayout } from '../components/layouts/AuthLayout';
import { DashboardLayout } from '../components/layouts/DashboardLayout';
import {
  Avatar,
  Card,
  Checkbox,
  Dialog,
  FileDropzone,
  FormField,
  Input,
  Pagination,
  Select,
  StarRating,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  Timeline,
  Tooltip
} from '../components/ui/Primitives';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
export function DesignPage() {
  const [dialog, setDialog] = useState(false);
  return (
    <main className="design-page">
      <h1>DriveHire design system</h1>
      <p>Shared components, states and layouts used across the product.</p>
      <section>
        <h2>Controls</h2>
        <Button>Primary action</Button> <Button variant="secondary">Secondary</Button>{' '}
        <Button loading>Saving</Button>
        <div className="gallery-row">
          <Input placeholder="Your name" />
          <Textarea placeholder="Add a note" />
          <Select label="Journey type" options={['Vehicle hire', 'Carpool']} />
        </div>
        <FormField label="Email address" hint="We’ll only use this for your account.">
          <Input type="email" autoComplete="email" />
        </FormField>
        <Checkbox label="Remember this preference" />
        <Switch label="Available for trips" />
        <FileDropzone accept="image/*,.pdf" onFile={() => undefined} />
      </section>
      <section>
        <h2>Feedback and data</h2>
        <Badge tone="success">Confirmed</Badge> <Badge tone="warning">Pending</Badge>{' '}
        <Badge tone="danger">Cancelled</Badge>
        <Card>
          <h3>Journey summary</h3>
          <p>Clear details, all in one place.</p>
        </Card>
        <Avatar name="Ananya Shah" />
        <StarRating value={4} onChange={() => undefined} />
        <Tabs
          items={[
            { label: 'Details', content: 'Booking details' },
            { label: 'Updates', content: 'Recent updates' }
          ]}
        />
        <Pagination page={1} pages={4} onChange={() => undefined} />
        <Stepper steps={['Choose', 'Book', 'Travel']} current={1} />
        <Timeline
          items={[
            { title: 'Request sent', detail: 'Today, 10:30 am' },
            { title: 'Owner confirmed', detail: 'Today, 11:15 am' }
          ]}
        />
        <Tooltip label="Helpful context">Hover or focus</Tooltip>
        <Skeleton />
        <EmptyState title="No rides yet">Your saved rides will appear here.</EmptyState>
        <ErrorState onRetry={() => undefined} />
        <Button variant="secondary" onClick={() => setDialog(true)}>
          Open dialog
        </Button>
        {dialog && (
          <Dialog title="Example dialog" onClose={() => setDialog(false)}>
            A shared modal pattern.
          </Dialog>
        )}
      </section>
      <section>
        <h2>Auth layout preview</h2>
        <div className="layout-preview">
          <AuthLayout>
            <h2>Sign in to DriveHire</h2>
          </AuthLayout>
        </div>
        <h2>Dashboard layout preview</h2>
        <div className="layout-preview">
          <DashboardLayout>
            <h2>Welcome back</h2>
          </DashboardLayout>
        </div>
      </section>
    </main>
  );
}
