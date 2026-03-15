FROM amazonlinux:2023
ARG CACHEBUST=2026-03-15-14-22-35

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
