-- Petty cash is retired: remove its old rows so they no longer count anywhere.
DELETE FROM `Expense` WHERE `kind` = 'PETTY_CASH';
