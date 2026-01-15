FROM amazonlinux:2023
ARG CACHEBUST=2026-01-15-14-17-40

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
