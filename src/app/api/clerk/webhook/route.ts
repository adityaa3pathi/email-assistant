import { db } from "@/server/db"


type ClerkUserWebhook = {
  id: string;
  email_addresses: { email_address: string }[];
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
};


export const POST  = async (req: Request) => {
    const{ data } :  {data: ClerkUserWebhook}= await req.json()
    console.log('clerk webhook received', data)

   const emailAddress = data.email_addresses[0]?.email_address || "";
  const firstName = data.first_name || "Unknown";
  const lastName = data.last_name || "User";   // fallback to prevent null issue
  const imageUrl = data.image_url || "";

  const user = await db.user.create({
    data: {
      id: data.id,
      emailAddress,
      firstName,
      lastName,
      imageUrl,
    },
  });


      console.log("Created user:", user);

    return new Response('webhook received', {status: 200})
}