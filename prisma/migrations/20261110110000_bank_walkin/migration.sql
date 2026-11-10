-- Bank transfer is allowed for walk-ins again.
UPDATE `PaymentMethod` SET `requiresCustomer` = false WHERE `key` = 'BANK';
