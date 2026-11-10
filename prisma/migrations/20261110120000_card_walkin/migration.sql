-- Card is allowed for walk-ins (no registered customer needed).
UPDATE `PaymentMethod` SET `requiresCustomer` = false WHERE `key` = 'CARD';
