FROM node:23.4.0-slim

RUN apt update && apt install curl unzip -y

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY package.json bun.lockb ./

RUN bun install

COPY . .

EXPOSE 3000

CMD ["bun", "run", "dev"]