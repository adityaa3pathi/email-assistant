import Mail from "./mail"


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