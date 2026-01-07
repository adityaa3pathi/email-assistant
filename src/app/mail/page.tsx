"use client"

import dynamic from "next/dynamic"

const Mail  = dynamic(() => {
  return import('./mail')
},
 {
   ssr: false
})          //we are importing mail dynamically so that it dosen't render as a server side component as it'll cause hydration errors and the data that we are storing on localStorage won't work properly


interface pageProps {
  
}

const page = ({}) => {
  return <Mail
  defaultCollapsed={false}
  defaultLayout={[20, 32, 48]}
  navCollapsedSize={4}
  />
}

export default page