import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatGhs } from '../../lib/format';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { AsyncList } from '../../components/AsyncList';
import { Input, Select, Textarea } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import {
  ACCOUNT_CLASSIFICATION_OPTIONS,
  ACCOUNT_DETAIL_TYPE_LABELS,
  ACCOUNT_TYPE_OPTIONS,
  DETAIL_TYPES_BY_ACCOUNT_TYPE,
  NORMAL_BALANCE_OPTIONS,
  type Account,
  type AccountClassification,
  type AccountDetailType,
  type AccountType,
  type NormalBalance,
} from '@shared/schemas';
import { accountLabel, classificationLabel, detailTypeLabel, normalBalanceLabel, todayInput, typeLabel } from './helpers';

interface AccountFormState {
  code: string;
  name: string;
  description: string;
  account_type: AccountType;
  detail_type: AccountDetailType;
  classification: AccountClassification;
  normal_balance: NormalBalance;
  parent_id: string;
  sort_order: number;
}

const blank: AccountFormState = {
  code: '',
  name: '',
  description: '',
  account_type: 'expense',
  detail_type: 'uncategorised_expense',
  classification: 'operating_expense',
  normal_balance: 'debit',
  parent_id: '',
  sort_order: 999,
};

export default function ChartOfAccounts(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<AccountFormState>(blank);
  const [saving, setSaving] = useState(false);

  const accounts = useAsync(() => api.accounts.list({ includeInactive: true }), []);
  const balances = useAsync(() => api.reports.trialBalance(todayInput()), []);

  const balanceByAccount = new Map<string, number>();
  if (balances.status === 'ok') {
    for (const row of balances.data) balanceByAccount.set(row.account_id, row.balance_pesewas);
  }

  function openNew(): void {
    setEditing(null);
    setForm(blank);
    setCreating(true);
  }

  function openEdit(account: Account): void {
    setEditing(account);
    setForm({
      code: account.code,
      name: account.name,
      description: account.description ?? '',
      account_type: account.account_type,
      detail_type: account.detail_type,
      classification: account.classification,
      normal_balance: account.normal_balance,
      parent_id: account.parent_id ?? '',
      sort_order: account.sort_order,
    });
    setCreating(true);
  }

  function closeModal(): void {
    if (!saving) setCreating(false);
  }

  function setType(next: AccountType): void {
    const detail = DETAIL_TYPES_BY_ACCOUNT_TYPE[next][0];
    setForm((s) => ({
      ...s,
      account_type: next,
      detail_type: detail,
      normal_balance: next === 'asset' || next === 'expense' ? 'debit' : 'credit',
    }));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Account code and name are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        account_type: editing?.is_system ? editing.account_type : form.account_type,
        detail_type: form.detail_type,
        classification: form.classification,
        normal_balance: form.normal_balance,
        parent_id: form.parent_id || null,
        system_key: editing?.system_key ?? null,
        is_active: editing?.is_active ?? true,
        is_system: editing?.is_system ?? false,
        sort_order: form.sort_order,
      };
      if (editing) {
        await api.accounts.update(editing.id, payload);
        toast.ok('Account updated');
      } else {
        await api.accounts.create(payload);
        toast.ok('Account created');
      }
      setCreating(false);
      accounts.refresh();
      balances.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save account');
    } finally {
      setSaving(false);
    }
  }

  async function archive(account: Account): Promise<void> {
    try {
      await api.accounts.archive(account.id);
      toast.ok('Account made inactive');
      accounts.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make account inactive');
    }
  }

  const rows = accounts.status === 'ok' ? accounts.data : [];
  const parentOptions = rows
    .filter((a) => !editing || a.id !== editing.id)
    .map((a) => ({ value: a.id, label: accountLabel(a) }));
  const detailOptions = DETAIL_TYPES_BY_ACCOUNT_TYPE[form.account_type].map((value) => ({
    value,
    label: ACCOUNT_DETAIL_TYPE_LABELS[value],
  }));

  return (
    <div className="page fade-up">
      <Modal
        open={creating}
        onClose={closeModal}
        title={editing ? 'Edit account' : 'New account'}
        description={editing?.is_system ? 'System accounts can be renamed, but their type is locked to protect posting.' : undefined}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" form="account-form" loading={saving}>
              {editing ? 'Save changes' : 'Create account'}
            </Button>
          </>
        )}
      >
        <form id="account-form" onSubmit={(e) => { void submit(e); }}>
          <div className="form-grid">
            <Input label="Code" mono value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
            <Input label="Name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} autoFocus />
            <Select
              label="Account type"
              value={form.account_type}
              disabled={editing?.is_system}
              onChange={(e) => setType(e.target.value as AccountType)}
              options={[...ACCOUNT_TYPE_OPTIONS]}
            />
            <Select
              label="Detail type"
              value={form.detail_type}
              onChange={(e) => setForm((s) => ({ ...s, detail_type: e.target.value as AccountDetailType }))}
              options={detailOptions}
            />
            <Select
              label="Classification"
              value={form.classification}
              onChange={(e) => setForm((s) => ({ ...s, classification: e.target.value as AccountClassification }))}
              options={[...ACCOUNT_CLASSIFICATION_OPTIONS]}
            />
            <Select
              label="Normal balance"
              value={form.normal_balance}
              onChange={(e) => setForm((s) => ({ ...s, normal_balance: e.target.value as NormalBalance }))}
              options={[...NORMAL_BALANCE_OPTIONS]}
            />
            <Select
              containerClass="full"
              label="Parent account"
              value={form.parent_id}
              onChange={(e) => setForm((s) => ({ ...s, parent_id: e.target.value }))}
              options={[{ value: '', label: '-' }, ...parentOptions]}
            />
            <Textarea
              containerClass="full"
              label="Description"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      <header className="page-head">
        <div>
          <h1 className="page-title">Chart of Accounts</h1>
        </div>
        <div className="page-actions">
          <Button variant="primary" onClick={openNew}>New account</Button>
        </div>
      </header>

      <AsyncList state={accounts} loadingLabel="Loading chart of accounts..." emptyTitle="No accounts found">
        {(list) => (
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 130 }}>Type</th>
                  <th style={{ width: 190 }}>Detail type</th>
                  <th className="num" style={{ width: 150 }}>QuickBooks balance</th>
                  <th style={{ width: 190 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const indent = a.parent_id ? 22 : 0;
                  return (
                    <tr key={a.id} style={{ opacity: a.is_active ? 1 : 0.58 }}>
                      <td>
                        <div style={{ paddingLeft: indent }}>
                          <span className="cell-lead">
                            <span className="mono faint">{a.code}</span>
                            <span style={{ fontWeight: 500 }}>{a.name}</span>
                          </span>
                          <div className="faint" style={{ fontSize: 12 }}>
                            {classificationLabel(a.classification)} · {normalBalanceLabel(a.normal_balance)}
                            {!a.is_active ? ' · inactive' : ''}
                            {a.is_system ? ' · system' : ''}
                          </div>
                        </div>
                      </td>
                      <td>{typeLabel(a.account_type)}</td>
                      <td>{detailTypeLabel(a.detail_type)}</td>
                      <td className="num">{formatGhs(balanceByAccount.get(a.id) ?? 0)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <SplitButton
                          size="sm"
                          onClick={() => navigate(`/accounting/accounts/${a.id}`)}
                          menu={(
                            <>
                              <Dropdown.Item onSelect={() => openEdit(a)}>Edit</Dropdown.Item>
                              {a.is_active && <Dropdown.Item onSelect={() => { void archive(a); }}>Make inactive</Dropdown.Item>}
                            </>
                          )}
                        >
                          Run report
                        </SplitButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AsyncList>
    </div>
  );
}
