FROM amazonlinux:2023
ARG CACHEBUST=2026-05-15-15-56-55

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
