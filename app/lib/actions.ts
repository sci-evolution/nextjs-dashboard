'use server';

import { z } from "zod";
import { sql } from "@vercel/postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";


// Zod validates and handle form data.
const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({ invalid_type_error: 'Please select a customer.' }),
  amount: z.coerce.number().gt(0, 'Please enter a amount greater than $0.'),
  status: z.enum(['pending', 'paid'], {invalid_type_error: 'Please select an invoice status.'}),
  date: z.string()
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

// This is temporary until @types/react-dom is updated.
export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  try {
    // Validate form using zod.
    const validateFields = CreateInvoice.safeParse({
      customerId: formData.get('customerId'),
      amount: formData.get('amount'),
      status: formData.get('status')
    });

    // If formValidation passes continue, otherwise return an error.
    if(validateFields.success) {
      const { customerId, amount, status } = validateFields.data;
      const amountInCents = amount * 100;
      const date = new Date().toISOString().split('T')[0]
  
      // Insert data into the database.
      await sql`
        INSERT INTO invoices (customer_id, amount, status, date) 
        VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
      `;
    } else {
      return {
        errors: validateFields.error.flatten().fieldErrors,
        message: 'Missing Fields. Failed to create invoice.'
      };
    }

  } catch(err) {
    // Log the error and return a custom message.
    console.error(err);
    throw new Error('Fail on create invoice.');
  }

  // Revalidatethe cache for the invoices page and redirect the user.
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, formData: FormData) {
  try {
    const { customerId, amount, status } = UpdateInvoice.parse({
      customerId: formData.get('customerId'),
      amount: formData.get('amount'),
      status: formData.get('status')
    });
    const amountInCents = amount * 100;

    await sql`
      UPDATE invoices 
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status} 
      WHERE id = ${id}
    `;
    revalidatePath('/dashboard/invoices');
  } catch(err) {
    console.error(err);
    return {
      type: 'Error',
      message: 'Fail on update invoice.'
    };
  }
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
    return {
      type: 'Success',
      message: 'Invoice deleted.'
    };
  } catch(err) {
    console.error(err);
    throw new Error('Database Error: Fail on delete invoice.');
  }
}

export async function authenticate(prevState: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }

    throw error;
  }
}
