import crypto from 'crypto';

export interface InitPaymentParams {
  userId: string;
  userEmail: string;
  amount: number;
  currency?: string;
  reference: string;
  paymentMethod?: string;
  callbackUrl?: string;
}

export interface InitPaymentResult {
  checkoutUrl: string;
  providerReference: string;
  provider: string;
}

export interface VerifyPaymentResult {
  verified: boolean;
  reference: string;
  amount: number;
  currency: string;
  status: 'successful' | 'pending' | 'failed' | 'cancelled';
  providerReference?: string;
  paymentMethod?: string;
  errorMessage?: string;
}

export class PaymentService {
  private get provider(): string {
    return (process.env.PAYMENT_PROVIDER || 'paystack').toLowerCase().trim();
  }

  private get secretKey(): string {
    return (
      process.env.PAYMENT_SECRET_KEY ||
      process.env.PAYMENT_PROVIDER_SECRET ||
      process.env.PAYSTACK_SECRET_KEY ||
      ''
    ).trim();
  }

  private get publicKey(): string {
    return (
      process.env.PAYMENT_PUBLIC_KEY ||
      process.env.PAYMENT_PROVIDER_PUBLIC ||
      process.env.PAYSTACK_PUBLIC_KEY ||
      ''
    ).trim();
  }

  private get webhookSecret(): string {
    return (
      process.env.PAYMENT_WEBHOOK_SECRET ||
      process.env.PAYMENT_SECRET_KEY ||
      process.env.PAYMENT_PROVIDER_SECRET ||
      process.env.PAYSTACK_SECRET_KEY ||
      ''
    ).trim();
  }

  private get appUrl(): string {
    return (process.env.APP_URL || '').replace(/\/$/, '');
  }

  /**
   * Initializes a payment transaction with the configured provider.
   * Does NOT credit any wallet balance.
   */
  async initializePayment(params: InitPaymentParams): Promise<InitPaymentResult> {
    const { userId, userEmail, amount, currency = 'NGN', reference, paymentMethod, callbackUrl } = params;
    const provider = this.provider;
    const baseUrl = this.appUrl;
    const redirectUrl = callbackUrl || `${baseUrl}/wallet?reference=${encodeURIComponent(reference)}&verify=true`;

    if (provider === 'paystack') {
      if (!this.secretKey) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Paystack LIVE credentials (PAYMENT_SECRET_KEY) must be configured in production.');
        }
        console.warn('Paystack PAYMENT_SECRET_KEY not configured in non-production. Falling back to Sandbox Virtual Gateway.');
        return {
          checkoutUrl: `${baseUrl}/payment/checkout?reference=${encodeURIComponent(reference)}&amount=${amount}`,
          providerReference: 'VNK-' + reference,
          provider: 'virtual_bank',
        };
      }

      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          amount: Math.round(amount * 100), // Paystack uses kobo
          currency: currency.toUpperCase(),
          reference,
          callback_url: redirectUrl,
          metadata: {
            userId,
            paymentMethod,
            custom_fields: [
              { display_name: 'User ID', variable_name: 'user_id', value: userId },
              { display_name: 'Payment Method', variable_name: 'payment_method', value: paymentMethod || 'Direct' }
            ]
          }
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.status) {
        console.error('Paystack initialize error:', data);
        throw new Error(data.message || 'Failed to initialize Paystack payment.');
      }

      return {
        checkoutUrl: data.data.authorization_url,
        providerReference: data.data.access_code || data.data.reference,
        provider: 'paystack',
      };
    } else if (provider === 'flutterwave') {
      if (!this.secretKey) {
        console.warn('Flutterwave PAYMENT_SECRET_KEY not configured. Falling back to built-in Sandbox Virtual Gateway.');
        return {
          checkoutUrl: `${this.appUrl}/payment/checkout?reference=${encodeURIComponent(reference)}&amount=${amount}`,
          providerReference: 'VNK-' + reference,
          provider: 'virtual_bank',
        };
      }

      const response = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: reference,
          amount,
          currency: currency.toUpperCase(),
          redirect_url: redirectUrl,
          customer: {
            email: userEmail,
          },
          meta: {
            userId,
            paymentMethod,
          },
          customizations: {
            title: 'CHECKSCROW Wallet Funding',
            description: `Fund wallet with ₦${amount.toLocaleString()}`,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok || data.status !== 'success') {
        console.error('Flutterwave initialize error:', data);
        throw new Error(data.message || 'Failed to initialize Flutterwave payment.');
      }

      return {
        checkoutUrl: data.data.link,
        providerReference: String(data.data.id || reference),
        provider: 'flutterwave',
      };
    } else if (provider === 'virtual_bank' || provider === 'simulation') {
      // Sandbox / Virtual Bank gateway simulation mode for test environments
      return {
        checkoutUrl: `${this.appUrl}/payment/checkout?reference=${encodeURIComponent(reference)}&amount=${amount}`,
        providerReference: 'VNK-' + reference,
        provider: 'virtual_bank',
      };
    } else {
      throw new Error(`Unsupported payment provider '${provider}'.`);
    }
  }

  /**
   * Verifies a payment transaction directly with the provider API.
   */
  async verifyPayment(reference: string, expectedAmount?: number): Promise<VerifyPaymentResult> {
    const provider = this.provider;

    if (provider === 'paystack') {
      if (!this.secretKey) {
        if (process.env.NODE_ENV === 'production') {
          return {
            verified: false,
            reference,
            amount: 0,
            currency: 'NGN',
            status: 'failed',
            errorMessage: 'Payment gateway credentials (PAYMENT_SECRET_KEY) are not configured for production.',
          };
        }
        return {
          verified: true,
          reference,
          amount: expectedAmount || 0,
          currency: 'NGN',
          status: 'successful',
          providerReference: 'VNK-' + reference,
          paymentMethod: 'virtual_bank_transfer',
        };
      }

      const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
        },
      });

      const data = await response.json();
      if (!response.ok || !data.status) {
        return {
          verified: false,
          reference,
          amount: 0,
          currency: 'NGN',
          status: 'failed',
          errorMessage: data.message || 'Paystack verification failed.',
        };
      }

      const txData = data.data;
      const actualAmountInNaira = (txData.amount || 0) / 100;
      const isStatusSuccess = txData.status === 'success';

      let isVerified = isStatusSuccess;
      if (expectedAmount !== undefined && Math.abs(actualAmountInNaira - expectedAmount) > 0.01) {
        console.warn(`Paystack verification amount mismatch! Expected: ₦${expectedAmount}, Received: ₦${actualAmountInNaira}`);
        isVerified = false;
      }

      return {
        verified: isVerified,
        reference,
        amount: actualAmountInNaira,
        currency: txData.currency || 'NGN',
        status: isStatusSuccess ? 'successful' : txData.status === 'failed' ? 'failed' : 'pending',
        providerReference: String(txData.id || txData.reference || ''),
        paymentMethod: txData.channel || 'card',
      };
    } else if (provider === 'flutterwave') {
      if (!this.secretKey) {
        return {
          verified: true,
          reference,
          amount: expectedAmount || 0,
          currency: 'NGN',
          status: 'successful',
          providerReference: 'VNK-' + reference,
          paymentMethod: 'virtual_bank_transfer',
        };
      }

      const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify-by-reference?tx_ref=${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
        },
      });

      const data = await response.json();
      if (!response.ok || data.status !== 'success') {
        return {
          verified: false,
          reference,
          amount: 0,
          currency: 'NGN',
          status: 'failed',
          errorMessage: data.message || 'Flutterwave verification failed.',
        };
      }

      const txData = data.data;
      const actualAmount = Number(txData.amount || 0);
      const isStatusSuccess = txData.status === 'successful';

      let isVerified = isStatusSuccess;
      if (expectedAmount !== undefined && Math.abs(actualAmount - expectedAmount) > 0.01) {
        isVerified = false;
      }

      return {
        verified: isVerified,
        reference,
        amount: actualAmount,
        currency: txData.currency || 'NGN',
        status: isStatusSuccess ? 'successful' : 'failed',
        providerReference: String(txData.id || ''),
        paymentMethod: txData.payment_type || 'card',
      };
    } else if (provider === 'virtual_bank' || provider === 'simulation') {
      return {
        verified: true,
        reference,
        amount: expectedAmount || 0,
        currency: 'NGN',
        status: 'successful',
        providerReference: 'VNK-' + reference,
        paymentMethod: 'virtual_bank_transfer',
      };
    } else {
      throw new Error(`Unsupported payment provider '${provider}'.`);
    }
  }

  /**
   * Verifies the cryptographic webhook signature sent by the provider.
   */
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    const provider = this.provider;

    if (provider === 'virtual_bank' || provider === 'simulation') {
      return true;
    }

    if (!this.webhookSecret) {
      console.warn('PAYMENT_WEBHOOK_SECRET is not configured.');
      return false;
    }

    try {
      const hash = crypto
        .createHmac('sha512', this.webhookSecret)
        .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    } catch (err) {
      console.error('Webhook signature verification error:', err);
      return false;
    }
  }

  /**
   * Resolves a bank account number via Paystack Name Enquiry.
   * If secretKey is missing or provider API fails, returns verified = false.
   * Never fakes account resolution!
   */
  async resolveBankAccount(accountNumber: string, bankCode: string): Promise<{
    verified: boolean;
    accountName: string;
    accountNumber: string;
    errorMessage?: string;
  }> {
    const provider = this.provider;

    if (provider === 'paystack') {
      if (!this.secretKey) {
        return {
          verified: false,
          accountName: '',
          accountNumber,
          errorMessage: 'Paystack secret key is not configured for account resolution.',
        };
      }

      try {
        const response = await fetch(
          `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.secretKey}`,
            },
          }
        );

        const data = await response.json();
        if (!response.ok || !data.status) {
          return {
            verified: false,
            accountName: '',
            accountNumber,
            errorMessage: data.message || 'Could not verify bank account with Paystack.',
          };
        }

        return {
          verified: true,
          accountName: data.data.account_name || '',
          accountNumber: data.data.account_number || accountNumber,
        };
      } catch (err: any) {
        console.error('Paystack resolveBankAccount error:', err);
        return {
          verified: false,
          accountName: '',
          accountNumber,
          errorMessage: err.message || 'Account resolution failed.',
        };
      }
    }

    return {
      verified: false,
      accountName: '',
      accountNumber,
      errorMessage: `Bank account resolution not supported for provider '${provider}'.`,
    };
  }

  /**
   * Initiates a transfer payout using Paystack API.
   * If provider is not configured for transfers, returns success = false with isConfigError = true.
   */
  async initiateTransfer(params: {
    amount: number;
    accountNumber: string;
    accountName: string;
    bankCode: string;
    reference: string;
    reason?: string;
  }): Promise<{
    success: boolean;
    status: string;
    transferCode?: string;
    providerReference?: string;
    errorMessage?: string;
    isConfigError?: boolean;
  }> {
    const provider = this.provider;

    if (provider === 'paystack') {
      if (!this.secretKey) {
        return {
          success: false,
          status: 'failed',
          errorMessage: 'Paystack secret key is not configured for transfers.',
          isConfigError: true,
        };
      }

      try {
        // Step 1: Create Transfer Recipient
        const recipientRes = await fetch('https://api.paystack.co/transferrecipient', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'nuban',
            name: params.accountName,
            account_number: params.accountNumber,
            bank_code: params.bankCode,
            currency: 'NGN',
          }),
        });

        const recipientData = await recipientRes.json();
        if (!recipientRes.ok || !recipientData.status) {
          console.error('Paystack transferrecipient error:', recipientData);
          return {
            success: false,
            status: 'failed',
            errorMessage: recipientData.message || 'Failed to create Paystack transfer recipient.',
            isConfigError: recipientData.message?.includes('not enabled') || recipientData.message?.includes('Third party payouts'),
          };
        }

        const recipientCode = recipientData.data.recipient_code;

        // Step 2: Initiate Transfer
        const transferRes = await fetch('https://api.paystack.co/transfer', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source: 'balance',
            amount: Math.round(params.amount * 100), // kobo
            recipient: recipientCode,
            reference: params.reference,
            reason: params.reason || 'CHECKSCROW Wallet Withdrawal',
          }),
        });

        const transferData = await transferRes.json();
        if (!transferRes.ok || !transferData.status) {
          console.error('Paystack transfer error:', transferData);
          return {
            success: false,
            status: 'failed',
            errorMessage: transferData.message || 'Failed to initiate Paystack transfer payout.',
            isConfigError: transferData.message?.includes('not enabled') || transferData.message?.includes('balance'),
          };
        }

        return {
          success: true,
          status: transferData.data.status || 'success',
          transferCode: transferData.data.transfer_code,
          providerReference: String(transferData.data.id || transferData.data.reference || ''),
        };
      } catch (err: any) {
        console.error('Paystack initiateTransfer error:', err);
        return {
          success: false,
          status: 'failed',
          errorMessage: err.message || 'Failed to process transfer with provider.',
        };
      }
    }

    return {
      success: false,
      status: 'failed',
      errorMessage: `Payouts not supported for provider '${provider}'.`,
      isConfigError: true,
    };
  }
}

export const paymentService = new PaymentService();
