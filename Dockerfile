FROM loadimpact/k6:0.27.1

LABEL maintainer="jack.vasc@yahoo.com.br"

USER root

RUN apk add --update npm

RUN mkdir /app

COPY package*.json main.js /app/

WORKDIR /app

RUN npm install

USER k6

ENTRYPOINT [ "node", "main.js" ]