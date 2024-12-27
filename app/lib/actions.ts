'use server'; // this marks exported functions as Server Actions, so they can be run on the server or client
 
import { z } from 'zod';
import { sql } from '@vercel/postgres'
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation'
import { signIn } from '@/auth'
import { AuthError } from 'next-auth'

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Amount must be greater than 0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select a status.',
  }),
  date: z.string()
})

const CreateInvoice = FormSchema.omit({ id: true, date: true })

export async function createInvoice(prevState: State, formData: FormData) {
  const customerIdRaw = formData.get('customerId'),
    amountRaw = formData.get('amount'),
    statusRaw = formData.get('status');

  const validatedFields = CreateInvoice.safeParse({
    customerId: customerIdRaw,
    amount: amountRaw,
    status: statusRaw,
  });

  // If form validation fails, return an error message
  if (!validatedFields.success) {
    console.log(formData)
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to create invoice.'
    };
  }

  // Prepare data for insertion
  const { customerId, amount, status } = validatedFields.data;

  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `
  } catch (error) {
    return {
      message: 'Failed to create invoice.'
    }
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

const UpdateInvoice = FormSchema.omit({ id: true, date: true })

export async function updateInvoice(id: string, formData: FormData) {
  const { customerId, amount, status } = UpdateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  const amountInCents = amount * 100;

  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
      `
    revalidatePath('/dashboard/invoices');
  } catch (error) {
    return {
      message: 'Failed to update invoice.'
    }
  }

  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {

  try {
    await sql`
      DELETE FROM payments
      WHERE invoice_id = ${id}
    `
    revalidatePath('/dashboard/invoices');
    return {
      message: 'Invoice deleted successfully'
    }
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Failed to delete invoice.'
    }
  }
}

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
}

// Authentication
export async function authenticate(prevState: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', formData)
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return {
            message: 'Invalid credentials'
          }
        default:
          return {
            message: 'Something went wrong'
          }
      }
    }
  }

  redirect('/dashboard')
}

