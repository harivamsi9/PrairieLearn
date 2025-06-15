FROM amazonlinux:2023
ARG CACHEBUST=2025-06-15-14-10-14

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
