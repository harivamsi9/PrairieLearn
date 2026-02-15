FROM amazonlinux:2023
ARG CACHEBUST=2026-02-15-14-19-18

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
