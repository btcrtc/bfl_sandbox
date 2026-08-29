import { redirect } from 'next/navigation';

// The mock workflows gallery was removed; reusable workflows will return once
// they are real objects. Keep the route alive for old links.
export default function WorkflowsPage() {
  redirect('/playground');
}
