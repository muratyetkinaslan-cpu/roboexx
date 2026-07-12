# RoboExx Arduino derleme sunucusu — arduino-cli + Node, sıfır npm bağımlılığı
FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# arduino-cli kur
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | BINDIR=/usr/local/bin sh

# AVR çekirdeği (Uno / Nano / Mega)
RUN arduino-cli config init \
 && arduino-cli core update-index \
 && arduino-cli core install arduino:avr

WORKDIR /app
COPY server/arduino-compile.js ./arduino-compile.js

# İlk derleme yavaş olmasın diye çekirdeği ısıt (önbellek oluşturur)
RUN mkdir -p /tmp/warm/warm && printf 'void setup(){}\nvoid loop(){}\n' > /tmp/warm/warm/warm.ino \
 && arduino-cli compile --fqbn arduino:avr:uno /tmp/warm/warm \
 && rm -rf /tmp/warm

EXPOSE 8080
CMD ["node", "arduino-compile.js"]
