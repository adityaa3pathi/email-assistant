"use client"

import dynamic from "next/dynamic"
import { ThemeToggle } from "../_components/toggle-theme"

const Mail  = dynamic(() => {
  return import('./mail')
},
 {
   ssr: false
})          //we are importing mail dynamically so that it dosen't render as a server side component as it'll cause hydration errors and the data that we are storing on localStorage won't work properly


interface pageProps {
  
}

const page = () => {
  return (
    <main className="h-screen max-h-screen w-screen overflow-hidden bg-background">
      <Mail
        defaultCollapsed={false}
        defaultLayout={[20, 32, 48]}
        navCollapsedSize={4}
      />
    </main>
  )
}

export default page