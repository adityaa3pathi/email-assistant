import { db } from "@/server/db"

export const POST  = async (req: Request) => {
    const{ data }= await req.json()
    console.log('clerk webhook received', data)
    const emailAddress = data.email_addresses[0].email_address
    const firstName = data.first_name
    const lastName = data.last_name
    const ImgUrl  = data.image_url;

    const id = data.id
   const user =  await db.user.create({
        data: {
            id: id,
            emailAddress: emailAddress,
            firstName: firstName,
            lastName: lastName,
            imageUrl: ImgUrl,

        }
    })

      console.log("Created user:", user);

    return new Response('webhook received', {status: 200})
}