-- Card payments now need a registered customer (like Koko / Bank / Credit).
UPDATE `PaymentMethod` SET `requiresCustomer` = true WHERE `key` = 'CARD';
