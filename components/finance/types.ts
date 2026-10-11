// Plain, serialisable shapes passed from app/finance/page.tsx to the client tabs.
// Dates travel as ISO strings (business dates are Sri Lanka midnight instants).
import type { ProfitLoss, CashDrawer } from '@/lib/reports';

export type { ProfitLoss, CashDrawer };

export type ExpenseRow = {
  id: string;
  kind: string; // GENERAL | SALARY | PETTY_CASH
  category: string;
  amount: number;
  description: string | null;
  paidVia: string;
  expenseDate: string;
  workerName: string | null;
  branchName: string | null;
  userName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
};

export type WorkerRow = {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  branchId: string | null;
  branchName: string | null;
  monthlySalary: number;
  active: boolean;
  // for the selected salary month, voided payments excluded:
  paidBase: number;
  paidBonus: number;
  paidDeduction: number;
  paidNet: number;
};

export type SalaryRow = {
  id: string;
  workerName: string;
  period: string;
  baseAmount: number;
  bonus: number;
  deduction: number;
  netPaid: number;
  paidVia: string;
  paidAt: string;
  note: string | null;
  userName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
};

export type FloatRow = {
  branchId: string;
  branchName: string;
  active: boolean;
  amount: number;
  lastChangedAt: string | null;
};

export type FloatHistoryRow = {
  id: string;
  branchName: string;
  oldAmount: number;
  newAmount: number;
  delta: number;
  reason: string;
  userName: string | null;
  createdAt: string;
};

export type BranchOpt = { id: string; name: string };

// What both money pages share: the period, the branch scope and who is looking.
type FinanceBase = {
  currency: string;
  storeName: string;
  scopeLabel: string;
  allBranches: boolean;
  scopeBranchId: string | null;
  fromStr: string; // YYYY-MM-DD
  toStr: string;
  isOwner: boolean;
  pinnedBranchId: string | null; // a staff member locked to one branch
  branches: BranchOpt[];
};

// Accounting › Expenses & Payroll: money going out.
export type ExpensesData = FinanceBase & {
  month: string; // YYYY-MM for the Salaries tab
  monthOptions: { value: string; label: string }[];
  categories: { id: string; name: string }[];
  expenses: ExpenseRow[];
  petty: ExpenseRow[];
  workers: WorkerRow[];
  salaries: SalaryRow[];
};

// Accounting › Profit & Cash: what was earned and what should be in the till.
export type ProfitData = FinanceBase & {
  profit: ProfitLoss;
  drawer: CashDrawer;
  floats: FloatRow[];
  floatHistory: FloatHistoryRow[];
};
